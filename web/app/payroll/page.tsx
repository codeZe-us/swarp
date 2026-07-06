'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};
import { useStore } from '../../store/useStore';
import { ShimmerLoader } from '../../components/ui/ShimmerLoader';
import { Badge } from '../../components/ui/Badge';
import { isValidPublicKey } from '../../lib/stellar';
import { submitPayment } from '../../lib/contracts';
import { Recipient } from '../../store/types';
import { useToastStore } from '../../store/useToast';

export default function PayrollPage() {
  const router = useRouter();
  
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const exchangeRate = useStore((state) => state.exchangeRate);
  const teamMembers = useStore((state) => state.teamMembers);
  const config = useStore((state) => state.config);
  
  
  const recipients = useStore((state) => state.recipients);
  const [isRecipientDropdownOpen, setIsRecipientDropdownOpen] = useState(false);
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const lastRunDate = useStore((state) => state.lastRunDate);
  const addRecipient = useStore((state) => state.addRecipient);
  const updateRecipient = useStore((state) => state.updateRecipient);
  const removeRecipient = useStore((state) => state.removeRecipient);
  const runPayroll = useStore((state) => state.runPayroll);
  const addTransaction = useStore((state) => state.addTransaction);

  const isConnected = status === 'connected';

  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [kycVerified, setKycVerified] = useState(false);

  const [isFetchingData, setIsFetchingData] = useState(true);

  
  useEffect(() => {
    const timer = setTimeout(() => setIsFetchingData(false), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (address) {
      const savedStatus = localStorage.getItem(`kyc_status_${address}`);
      setKycVerified(savedStatus === 'verified');
    } else {
      setKycVerified(false);
    }
  }, [address]);

  
  const [formName, setFormName] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formAsset, setFormAsset] = useState<string>('USDC');

  
  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  
  const payRunTitle = useMemo(() => {
    const month = new Date().toLocaleString('en-US', { month: 'long' });
    return `${month} pay run`;
  }, []);

  
  const availableTeamMembers = useMemo(() => {
    return teamMembers.filter(m => {
      // Exclude if already in payroll, unless editing that exact recipient
      if (editingRecipient && editingRecipient.address === m.address) return true;
      return !recipients.some(r => r.address === m.address);
    });
  }, [teamMembers, recipients, editingRecipient]);

  // Compute USD value. In a real app we would use oracle prices.
  // For this testnet, we'll use approximate prices:
  const getAssetPrice = (asset: string) => {
    switch (asset) {
      case 'USDC': return 1.00;
      case 'EURC': return 1.08;
      case 'MGUSD': return 1.00;
      case 'YLDS': return 1.00;
      case 'XLM': return 0.10;
      default: return 1.00;
    }
  };

  const totals = useMemo(() => {
    let usdcSum = 0;
    let eurcSum = 0;
    let usdTotal = 0;

    recipients.forEach((r) => {
      const amt = parseFloat(r.amount) || 0;
      const price = getAssetPrice(r.asset);
      usdTotal += amt * price;

      if (r.asset === 'USDC') {
        usdcSum += amt;
      } else if (r.asset === 'EURC') {
        eurcSum += amt;
      }
    });

    return {
      usdc: usdcSum,
      eurc: eurcSum,
      usd: usdTotal,
    };
  }, [recipients]);

  
  const handleOpenAdd = () => {
    setEditingRecipient(null);
    setFormName('');
    setFormDept('');
    setFormAddress('');
    setFormAmount('');
    setFormAsset('USDC');
    setIsFormOpen(true);
  };

  
  const handleOpenEdit = (recipient: Recipient) => {
    setEditingRecipient(recipient);
    setFormName(recipient.name);
    setFormDept(recipient.department);
    setFormAddress(recipient.address);
    setFormAmount(recipient.amount);
    setFormAsset(recipient.asset);
    setIsFormOpen(true);
  };

  
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    
    if (!formName.trim()) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Please enter a recipient name.', severity: 'error' });
      return;
    }
    if (!formDept.trim()) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Please enter a department name.', severity: 'error' });
      return;
    }
    if (!formAddress.trim()) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Please enter a destination address.', severity: 'error' });
      return;
    }
    if (!isValidPublicKey(formAddress.trim())) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Invalid Stellar public key format. Address must start with G and be 56 characters.', severity: 'error' });
      return;
    }
    const amtVal = parseFloat(formAmount);
    if (isNaN(amtVal) || amtVal <= 0) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Amount must be a positive number greater than 0.', severity: 'error' });
      return;
    }

    
    const decimalsPart = formAmount.split('.')[1];
    if (decimalsPart && decimalsPart.length > 7) {
      useToastStore.getState().addToast({ title: 'Error', message: 'Amount precision cannot exceed 7 decimal places.', severity: 'error' });
      return;
    }

    try {
      const recipientData = {
        name: formName.trim(),
        department: formDept.trim(),
        address: formAddress.trim(),
        amount: formAmount,
        asset: formAsset,
      };

      if (editingRecipient) {
        await updateRecipient(editingRecipient.id, recipientData);
      } else {
        await addRecipient(recipientData);
      }

      setIsFormOpen(false);
      useToastStore.getState().addToast({ title: 'Success', message: 'Recipient saved.', severity: 'success' });
    } catch (err: any) {
      useToastStore.getState().addToast({ title: 'Error', message: err?.message || 'Failed to save recipient details.', severity: 'error' });
    }
  };

  
  const handleRunPayroll = async () => {
    if (!isConnected || !address) {
      connect();
      return;
    }
    if (recipients.length === 0) {
      alert('Please add at least one recipient to run payroll.');
      return;
    }
    
    setIsExecuting(true);
    setExecutionProgress(0);
    
    
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const tokenContractId = recipient.asset === 'USDC' ? config?.USDC_SAC_ID || '' : config?.EURC_SAC_ID || '';
      
      try {
        const amt = parseFloat(recipient.amount);
        const sendAmt = BigInt(Math.floor(amt * 10000000)); 
        
        
        const { txHash } = await submitPayment(address, recipient.address, tokenContractId, sendAmt);
        
        
        addTransaction({
          type: 'payroll',
          amount: recipient.amount,
          asset: recipient.asset,
          txHash: txHash,
          timestamp: Date.now(),
          privacy: 'private' 
        });
        
      } catch (error: any) {
        console.error(`Failed to process payment for ${recipient.name}:`, error);
        
        let errorMessage = error?.message || 'Unknown error occurred';
        if (errorMessage.includes('Missing required trustline')) {
          errorMessage = `${recipient.name} lacks a trustline for ${recipient.asset}. Ask them to add it to their wallet.`;
        }

        useToastStore.getState().addToast({ 
          title: `Payment failed for ${recipient.name}`, 
          message: errorMessage, 
          severity: 'error' 
        });
        
        setIsExecuting(false);
        return;
      }

      setExecutionProgress(i + 1);
    }
    
    await runPayroll();
    setIsExecuting(false);
    useToastStore.getState().addToast({ title: 'Success', message: `Private Payroll Successful! Executed ${recipients.length} transfers. Total: $${totals.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, severity: 'success' });
    router.push('/');
  };

  
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-8 max-w-5xl mx-auto font-sans"
    >
      
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-brandLightPurple tracking-wider uppercase font-display">Employer console</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Private payroll</h1>
          <p className="text-sm text-mutedText mt-1">Pay your whole team in one run — salaries never touch the public ledger.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAdd}
            disabled={!isConnected || !kycVerified}
            className={`px-4 py-2 border rounded-[9px] text-xs font-bold uppercase tracking-wider transition duration-150 font-display flex items-center gap-1.5 ${
              isConnected && kycVerified
                ? 'border-[rgba(94,42,140,0.4)] text-white hover:bg-brandPurple/10 bg-transparent'
                : 'border-borderSubtle text-mutedText/50 cursor-not-allowed bg-[#000000]'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add recipient
          </button>
          <Link
            href="/payroll/history"
            className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent text-center"
          >
            View History
          </Link>
        </div>
      </motion.div>

      {}
      {/* Top Stats */}
      {isFetchingData ? (
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
          <ShimmerLoader className="min-h-[148px]" borderRadius={13} />
        </motion.div>
      ) : (
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Total */}
        <div className="bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] rounded-[13px] p-6 flex flex-col justify-between min-h-[148px] shadow-[0_0_28px_rgba(123,55,168,0.25)] border-none">
          <div>
            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider font-display">This run total</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              ${Math.floor(totals.usd).toLocaleString()}
              <span className="text-2xl text-white/70">
                .{(totals.usd % 1).toFixed(2).slice(2)}
              </span>
            </h2>
          </div>
          {recipients.length > 0 && (
            <p className="text-[10px] text-white/60 font-mono mt-2">
              {totals.usdc.toLocaleString()} USDC · {totals.eurc.toLocaleString()} EURC
            </p>
          )}
        </div>

        {}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Recipients</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {recipients.length}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Active salary payouts defined in memory.</p>
        </div>

        {}
        <div className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col justify-between min-h-[148px]">
          <div>
            <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider font-display">Last run</span>
            <h2 className="text-4xl font-extrabold text-white mt-3 font-mono">
              {lastRunDate || 'None'}
            </h2>
          </div>
          <p className="text-[10px] text-mutedText mt-2">Timestamp of last local execution trigger.</p>
        </div>

      </motion.div>
      )}

      {}
      {/* Main Table Area */}
      {isFetchingData ? (
        <motion.div variants={itemVariants} className="w-full bg-[#0B0B0C] border border-borderSubtle rounded-[13px] overflow-hidden min-h-[300px]">
          <ShimmerLoader className="w-full h-full min-h-[300px]" borderRadius={13} />
        </motion.div>
      ) : !isConnected ? (
        <motion.div variants={itemVariants} className="bg-red-500/10 border border-red-500/20 rounded-[12px] p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-display">Employer Wallet Connection Required</h3>
            <p className="text-xs text-mutedText mt-1 max-w-sm">Connect your Stellar wallet to view, modify, or add employee salary lists securely on this device.</p>
          </div>
          <button
            onClick={connect}
            className="px-5 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display border-none"
          >
            Connect Wallet
          </button>
        </motion.div>
      ) : !kycVerified ? (
        <motion.div variants={itemVariants} className="bg-yellow-500/10 border border-yellow-500/20 rounded-[12px] p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-display">KYC Verification Required</h3>
            <p className="text-xs text-mutedText mt-1 max-w-sm">You must complete ZK-KYC verification before you can process private payrolls.</p>
          </div>
          <Link
            href="/kyc"
            className="px-5 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display border-none"
          >
            Verify Identity
          </Link>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="bg-cardSurface border border-borderSubtle rounded-[13px] p-6 flex flex-col gap-6">
          
          {}
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold text-white font-display">{payRunTitle}</h3>
            <span className="text-[9px] font-bold text-mutedText/70 tracking-widest uppercase font-mono">
              AMOUNTS VISIBLE ONLY TO YOU
            </span>
          </div>

          {}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1D1D1F] text-mutedText font-bold uppercase tracking-wider text-[10px] font-display">
                  <th className="pb-3 pr-4">Recipient</th>
                  <th className="pb-3 pr-4">Destination</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D1D1F]">
                {recipients.map((r) => (
                  <tr key={r.id} className="hover:bg-[#1D1D1F]/20 group transition duration-150">
                    
                    {}
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-brandPurple/20 border border-brandPurple/30 flex items-center justify-center text-white text-xs font-bold font-display select-none">
                          {getInitials(r.name)}
                        </div>
                        <div>
                          <span className="text-white font-bold block text-sm group-hover:text-brandLightPurple transition duration-150 font-display">
                            {r.name}
                          </span>
                          <span className="text-[10px] text-mutedText block mt-0.5 font-display">
                            {r.department}
                          </span>
                        </div>
                      </div>
                    </td>

                    {}
                    <td className="py-4 pr-4 font-mono text-mutedText font-medium text-xs">
                      {r.address.slice(0, 8)}...{r.address.slice(-8)}
                    </td>

                    {}
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-display select-none border ${
                          r.asset === 'USDC' ? 'bg-usdcColor/10 border-usdcColor/20 text-blue-400' :
                          r.asset === 'EURC' ? 'bg-brandPurple/10 border-brandPurple/20 text-[#B488DC]' :
                          r.asset === 'XLM' ? 'bg-white/10 border-white/20 text-white' :
                          'bg-green-500/10 border-green-500/20 text-green-400'
                        }`}>
                          <span className="text-xs">{r.asset === 'USDC' ? '$' : r.asset === 'EURC' ? '€' : ''}</span> {r.asset}
                        </div>
                        <span className="text-sm font-bold text-white font-mono select-all">
                          {parseFloat(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>

                    {}
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={() => handleOpenEdit(r)}
                          title="Edit member details"
                          className="text-mutedText hover:text-white transition duration-150 p-1"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeRecipient(r.id)}
                          title="Remove from payroll run"
                          className="text-mutedText hover:text-red-400 transition duration-150 p-1"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>

                  </tr>
                ))}

                {recipients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs text-mutedText font-semibold font-display">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <svg className="w-8 h-8 text-mutedText/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>No team members added. Click "+ Add recipient" to define salary payouts.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {}
          <div className="border-t border-[#1D1D1F] pt-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="text-xs text-mutedText block font-display font-semibold">Total payout</span>
              <span className="text-2xl font-extrabold text-white mt-1 block font-mono">
                ${totals.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <button
                onClick={handleRunPayroll}
                disabled={recipients.length === 0}
                className={`px-6 py-3 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 active:scale-[0.99] font-display flex items-center gap-2 ${
                  recipients.length === 0
                    ? 'bg-[#1D1D1F] text-mutedText cursor-not-allowed border border-[#333336] shadow-none'
                    : 'bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none'
                }`}
              >
                Run payroll privately
              </button>
            </div>
          </div>

        </motion.div>
      )}

      {}
      {/* Footer message */}
      <motion.div variants={itemVariants}>
        <p className="text-[10px] text-mutedText/60 text-center leading-relaxed font-semibold max-w-lg mx-auto">
          Each payout is a separate shielded withdrawal. On-chain, recipients and amounts can&apos;t be linked to your company or to each other.
        </p>
      </motion.div>

      {}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-opacity duration-300">
          <div className="w-full max-w-md bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] shadow-2xl relative flex flex-col font-sans overflow-hidden">
            
            {}
            <div className="p-6 pb-4 border-b border-[#1D1D1F]">
              <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Manage payroll</span>
              <h2 className="text-xl font-extrabold text-white mt-1 font-display">
                {editingRecipient ? 'Edit Recipient' : 'Add Recipient'}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="absolute top-5 right-5 text-mutedText hover:text-white transition duration-150 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {}
            <form onSubmit={handleFormSubmit} className="p-6 flex flex-col gap-4 font-display text-xs">
              
              {}
              <div className="flex flex-col gap-1.5">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Recipient (Team Member)</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsRecipientDropdownOpen(!isRecipientDropdownOpen)}
                    className="w-full flex items-center justify-between bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-semibold"
                  >
                    <span className={formName ? 'text-white' : 'text-mutedText'}>{formName || 'Select team member...'}</span>
                    <svg className={`w-3.5 h-3.5 text-mutedText transition-transform duration-200 ${isRecipientDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isRecipientDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-2 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display max-h-40 overflow-y-auto">
                      {availableTeamMembers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-mutedText text-center">No available team members</div>
                      ) : (
                        availableTeamMembers.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setFormName(m.name);
                              setFormAddress(m.address);
                              if (!formDept) setFormDept(m.role);
                              setIsRecipientDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
                              formName === m.name ? 'bg-[#1D1D1F] text-white' : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                            }`}
                          >
                            {m.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {}
              <div className="flex flex-col gap-1.5">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Department</label>
                <input
                  type="text"
                  placeholder="e.g. Engineering"
                  value={formDept}
                  onChange={(e) => setFormDept(e.target.value)}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-semibold"
                />
              </div>

              {}
              <div className="flex flex-col gap-1.5 opacity-60">
                <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Stellar Destination Address</label>
                <input
                  type="text"
                  placeholder="Auto-filled from team member"
                  value={formAddress}
                  readOnly
                  disabled
                  className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] p-2.5 text-mutedText outline-none text-xs font-mono font-medium cursor-not-allowed"
                />
              </div>

              {}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Amount</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-mono font-medium"
                  />
                </div>
                <div className="col-span-1 flex flex-col gap-1.5">
                  <label className="text-mutedText font-bold uppercase tracking-wider text-[10px]">Asset</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsAssetDropdownOpen(!isAssetDropdownOpen)}
                      className="w-full flex items-center justify-between bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-white outline-none focus:border-[#5E2A8C] text-xs font-semibold"
                    >
                      <span>{formAsset}</span>
                      <svg className={`w-3.5 h-3.5 text-mutedText transition-transform duration-200 ${isAssetDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isAssetDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-2 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display">
                        {['USDC', 'EURC', 'MGUSD', 'YLDS', 'XLM'].map(asset => (
                          <button
                            key={asset}
                            type="button"
                            onClick={() => {
                              setFormAsset(asset);
                              setIsAssetDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
                              formAsset === asset ? 'bg-[#1D1D1F] text-white' : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                            }`}
                          >
                            {asset}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {}
              <div className="flex gap-3 mt-4">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 shadow-[0_0_20px_rgba(123,55,168,0.25)] border-none"
                >
                  {editingRecipient ? 'Save Changes' : 'Add Member'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-3 border border-borderSubtle text-mutedText hover:text-white rounded-[9px] text-xs font-bold uppercase tracking-wider transition duration-150 bg-transparent"
                >
                  Cancel
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {}
      {isExecuting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-opacity duration-300">
          <div className="w-full max-w-md bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] shadow-2xl relative flex flex-col font-sans p-8 overflow-hidden items-center">
            
            {}
            <div className="w-16 h-16 border-4 border-[#1D1D1F] border-t-[#5E2A8C] rounded-full animate-spin mb-6"></div>

            <div className="text-center flex flex-col gap-2 w-full">
              <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display animate-pulse">
                Generating Zero-Knowledge Proofs...
              </span>
              <h2 className="text-xl font-extrabold text-white font-display">
                Processing Payroll
              </h2>
              <p className="text-sm text-mutedText mt-2 font-medium">
                Shielding transfers for {recipients.length} recipients...
              </p>
              
              {}
              <div className="w-full bg-[#1D1D1F] rounded-full h-2 mt-4 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-[#5E2A8C] to-[#B488DC] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(executionProgress / recipients.length) * 100}%` }}
                ></div>
              </div>
              <p className="text-[11px] text-mutedText mt-2 font-mono font-bold">
                {executionProgress} / {recipients.length} Completed
              </p>
            </div>

          </div>
        </div>
      )}

    </motion.div>
  );
}
