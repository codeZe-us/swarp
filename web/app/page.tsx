'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import { TransactionDetailModal } from '../components/ui/TransactionDetailModal';

import { getTokenBalance, fundTestnetUSDC, establishTrustline } from '../lib/contracts';
import { USDC_SAC_ID, EURC_SAC_ID } from '../lib/constants';

export default function Home() {
  const [filter, setFilter] = useState<'all' | 'swaps' | 'payroll'>('all');
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Zustand Store variables
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const exchangeRate = useStore((state) => state.exchangeRate);
  const fetchPoolState = useStore((state) => state.fetchPoolState);
  const notes = useStore((state) => state.notes);
  const transactions = useStore((state) => state.transactions);

  const isConnected = status === 'connected';

  // Balances state
  const [balances, setBalances] = useState({ USDC: 0, EURC: 0 });
  const [isLoading, setIsLoading] = useState(false);

  // Funding state
  const [isFunding, setIsFunding] = useState(false);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);

  const handleFundTestnet = async () => {
    if (!address) return;
    setIsFunding(true);
    setFundError(null);
    setFundSuccess(null);
    try {
      const txHash = await fundTestnetUSDC(address, '200');
      setFundSuccess(`Funded 200 USDC! Tx: ${txHash.slice(0, 8)}...`);
      
      // Update balances
      if (!USDC_SAC_ID) {
        setBalances((prev) => ({ ...prev, USDC: prev.USDC + 200 }));
      } else {
        const balance = await getTokenBalance(address, USDC_SAC_ID);
        setBalances((prev) => ({ ...prev, USDC: Number(balance) / 10_000_000 }));
      }
    } catch (e: any) {
      if (e.message === 'TRUSTLINE_MISSING') {
        try {
          setFundError('Trustline missing. Please sign the transaction in Freighter to add USDC to your wallet!');
          const issuerAddress = process.env.NEXT_PUBLIC_USDC_ISSUER_ADDRESS || 'GCUSVTVSWAHQMDO2KQC5H2TC6RCB7UNRQ5YD3XCPTNSCYWIQYMPN6VVX';
          await establishTrustline(address, 'USDC', issuerAddress);
          
          setFundError('Trustline established! Funding your wallet now...');
          const txHash = await fundTestnetUSDC(address, '200');
          setFundSuccess(`Funded 200 USDC! Tx: ${txHash.slice(0, 8)}...`);
          setFundError(null);
          
          if (USDC_SAC_ID) {
            const balance = await getTokenBalance(address, USDC_SAC_ID);
            setBalances((prev) => ({ ...prev, USDC: Number(balance) / 10_000_000 }));
          }
        } catch (trustlineErr: any) {
          setFundError(trustlineErr.message || 'Failed to establish trustline');
        }
      } else {
        setFundError(e.message || 'Failed to fund testnet account');
      }
    } finally {
      setIsFunding(false);
    }
  };

  // Fetch balances and pool state on connection
  useEffect(() => {
    if (isConnected && address) {
      setIsLoading(true);
      const loadDashboardData = async () => {
        try {
          // Fetch pool state
          await fetchPoolState();

          // Fetch balances from on-chain
          // In mock mode, getTokenBalance handles undefined SAC IDs
          const usdcBal = await getTokenBalance(address, USDC_SAC_ID || '');
          const eurcBal = await getTokenBalance(address, EURC_SAC_ID || '');
          setBalances({
            USDC: Number(usdcBal) / 10_000_000,
            EURC: Number(eurcBal) / 10_000_000,
          });
        } catch (e) {
          console.warn('Failed to load live data, using fallbacks:', e);
        } finally {
          setIsLoading(false);
        }
      };

      loadDashboardData();

      // Set 30-second interval refresh
      const interval = setInterval(() => {
        loadDashboardData();
      }, 30000);

      return () => clearInterval(interval);
    } else {
      setIsLoading(false);
      setBalances({ USDC: 0, EURC: 0 });
    }
  }, [isConnected, address, fetchPoolState]);

  // Exchange rate helpers
  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  // Portfolio total calculated value in USD
  const eurcUsdVal = useMemo(() => {
    return balances.EURC / decimalRate;
  }, [balances.EURC, decimalRate]);

  const totalValue = useMemo(() => {
    return balances.USDC + eurcUsdVal;
  }, [balances.USDC, eurcUsdVal]);

  // Swapped this month calculation (sum of withdrawals in current calendar month)
  const swappedThisMonth = useMemo(() => {
    if (!isConnected || transactions.length === 0) return 0;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return transactions
      .filter((tx) => {
        if (tx.type !== 'withdrawal') return false;
        const txDate = new Date(tx.timestamp);
        return txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
      })
      .reduce((sum, tx) => {
        const val = parseFloat(tx.amount);
        if (tx.asset === 'USDC') {
          return sum + val;
        } else {
          return sum + val / decimalRate;
        }
      }, 0);
  }, [transactions, isConnected, decimalRate]);

  // Count active unwithdrawn shielded notes
  const activeShieldedNotesCount = useMemo(() => {
    return notes.filter((n) => n.status === 'deposited').length;
  }, [notes]);

  // Reconstruct dynamic list of transactions
  // Sort transactions by timestamp (newest first)
  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return sortedTransactions.filter((tx) => {
      if (filter === 'all') return true;
      if (filter === 'swaps') return tx.type === 'withdrawal' || tx.type === 'deposit';
      if (filter === 'payroll') return tx.privacy === 'private';
      return true;
    });
  }, [sortedTransactions, filter]);

  // Find the currently selected transaction for the modal
  const activeTransaction = useMemo(() => {
    return transactions.find((t) => t.txHash === selectedTxHash) || null;
  }, [transactions, selectedTxHash]);

  // Dynamic portfolio history chart calculation
  const chartPoints = useMemo(() => {
    if (!isConnected) {
      return 'M 0,100 C 150,90 300,75 450,85 600,30';
    }

    if (sortedTransactions.length === 0) {
      if (totalValue > 0) {
        return `M 0,100 C 200,90 400,60 600,40`;
      }
      return 'M 0,100 L 600,100';
    }

    if (sortedTransactions.length === 1) {
      const tx = sortedTransactions[0];
      const amt = parseFloat(tx.amount);
      const change = tx.asset === 'USDC' ? amt : amt / decimalRate;
      const startPort = tx.type === 'withdrawal' ? totalValue + change : totalValue - change;
      
      const minV = Math.min(startPort, totalValue) * 0.9;
      const maxV = Math.max(startPort, totalValue) * 1.1;
      const r = maxV - minV || 1;
      
      const y1 = 100 - ((startPort - minV) / r) * 80;
      const y2 = 100 - ((totalValue - minV) / r) * 80;
      return `M 0,${y1} L 600,${y2}`;
    }

    const pointsCount = Math.min(10, sortedTransactions.length);
    const txsToUse = sortedTransactions.slice(0, pointsCount);
    let currentPort = totalValue;
    
    // Calculate backwards (newest to oldest)
    const checkpoints = txsToUse.map((tx, idx) => {
      const x = 600 - (idx / (pointsCount - 1)) * 600;
      const state = { x, val: currentPort };
      
      const amt = parseFloat(tx.amount);
      const isWithdrawal = tx.type === 'withdrawal';
      const change = tx.asset === 'USDC' ? amt : amt / decimalRate;
      
      if (isWithdrawal) currentPort += change;
      else currentPort -= change;

      return state;
    });

    checkpoints.reverse(); // left to right

    const minVal = Math.min(...checkpoints.map((c) => c.val)) * 0.9;
    const maxVal = Math.max(...checkpoints.map((c) => c.val)) * 1.1;
    const range = maxVal - minVal || 1;

    const pointsStr = checkpoints
      .map((c) => {
        const y = 100 - ((c.val - minVal) / range) * 80;
        return `${c.x},${y}`;
      })
      .join(' L ');

    return `M 0,100 L ${pointsStr}`;
  }, [isConnected, transactions, sortedTransactions, totalValue, decimalRate]);

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto font-sans">
      
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Dashboard</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">Welcome back</h1>
          <p className="text-sm text-mutedText mt-1">Here&apos;s what&apos;s moving across your shielded accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <button
              disabled
              className="px-4 py-2 border border-borderSubtle bg-[#000000] text-mutedText/50 cursor-not-allowed rounded-[9px] text-sm font-semibold transition duration-200 font-display flex items-center gap-1.5"
            >
              Run payroll
              <span className="text-[8px] bg-borderSubtle px-1.5 py-0.5 rounded font-extrabold tracking-widest text-mutedText/75">
                SOON
              </span>
            </button>
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#0B0B0C] border border-[#1D1D1F] text-slate-300 text-[10px] font-bold py-1 px-2.5 rounded shadow-lg whitespace-nowrap z-50">
              Private batch payroll coming soon
            </div>
          </div>
          {isConnected && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleFundTestnet}
                disabled={isFunding}
                className="px-4 py-2 border border-[#2775CA]/50 text-[#2775CA] hover:bg-[#2775CA]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent text-center disabled:opacity-50"
              >
                {isFunding ? 'Funding...' : 'Fund USDC'}
              </button>
              {fundError && (
                <div className="text-red-400 text-[10px] font-bold max-w-[200px] text-center">
                  {fundError}
                </div>
              )}
            </div>
          )}
          <Link
            href="/swap"
            className="px-4 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 rounded-[9px] text-sm font-semibold transition duration-200 text-white shadow-[0_0_20px_rgba(123,55,168,0.25)] font-display border-none"
          >
            New swap
          </Link>
        </div>
      </div>

      {/* Grid Layout: Main Charts & Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Portfolio Value Card (2/3 width) */}
        <div className="lg:col-span-2 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col justify-between h-[320px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText font-display">Portfolio value</span>
              {isConnected && (
                <div className="flex items-center gap-1 bg-[#5E2A8C]/10 border border-[#5E2A8C]/20 px-2.5 py-0.5 rounded-full text-xs font-semibold text-[#B488DC]">
                  <svg className="w-3 h-3 text-[#B488DC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span className="font-mono">12.4%</span>
                </div>
              )}
            </div>
            
            {isLoading ? (
              <div className="h-10 w-44 bg-[#1D1D1F]/50 animate-pulse rounded-lg mt-2" />
            ) : (
              <h2 className="text-4xl font-extrabold text-white mt-2 font-mono">
                ${Math.floor(totalValue).toLocaleString() || '0'}
                <span className="text-2xl text-mutedText/70 font-mono">
                  .{(totalValue % 1).toFixed(2).slice(2)}
                </span>
              </h2>
            )}
          </div>

          {/* SVG Line Chart */}
          <div className="h-32 w-full mt-4 relative">
            <svg viewBox="0 0 600 120" className="w-full h-full preserve-3d">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5E2A8C" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#4A1F70" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Gradient Area */}
              {isConnected && transactions.length > 0 ? (
                <path 
                  d={`${chartPoints} L 600,120 L 0,120 Z`} 
                  fill="url(#chartGradient)" 
                />
              ) : (
                <path 
                  d="M 0,100 C 150,90 300,75 450,85 600,30 L 600,120 L 0,120 Z" 
                  fill="url(#chartGradient)" 
                />
              )}

              {/* Line */}
              {isConnected && transactions.length > 0 ? (
                <path 
                  d={chartPoints} 
                  fill="none" 
                  stroke="#B488DC" 
                  strokeWidth="3.5" 
                  strokeLinecap="round"
                />
              ) : (
                <path 
                  d="M 0,100 C 150,90 300,75 450,85 600,30" 
                  fill="none" 
                  stroke="#B488DC" 
                  strokeWidth="3.5" 
                  strokeLinecap="round"
                />
              )}

              {/* Dot Point */}
              <circle cx="600" cy="30" r="4" fill="#ffffff" stroke="#5E2A8C" strokeWidth="2.5" />
            </svg>
            <div className="flex justify-between items-center text-[10px] font-bold text-mutedText/50 px-1 mt-2 font-mono">
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
              <span>Jun</span>
            </div>
          </div>
        </div>

        {/* Side Balance Cards */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          
          {/* USDC Balance Card */}
          <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col justify-between h-[148px]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText font-display">USDC balance</span>
              <div className="w-8 h-8 rounded-full bg-[#2775CA]/10 flex items-center justify-center border border-[#2775CA]/20">
                <svg className="w-4 h-4 text-[#2775CA]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.25 14.25v1.5h-2.5v-1.5c-2-.3-3.25-1.5-3.25-3.25h1.75c0 .85.75 1.5 1.5 1.5s1.5-.65 1.5-1.5c0-.85-.5-1.25-1.75-1.75-1.75-.7-3-.15-3-3.25s1.25-2.85 3.25-3.15v-1.65h2.5v1.65c1.8.35 2.75 1.45 2.75 3.1h-1.75c0-.95-.8-1.45-1.5-1.45s-1.5.5-1.5 1.35c0 .75.45 1.15 1.75 1.6 1.7.6 3 1.25 3 3.25 0 2.05-1.35 2.85-3.25 3.15z" />
                </svg>
              </div>
            </div>
            
            {isLoading ? (
              <div className="h-8 w-32 bg-[#1D1D1F]/50 animate-pulse rounded-lg mt-2" />
            ) : (
              <div>
                <h3 className="text-2xl font-extrabold text-white font-mono">
                  {balances.USDC.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-xs text-mutedText mt-1 font-mono">≈ ${balances.USDC.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>

          {/* EURC Balance Card */}
          <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col justify-between h-[148px]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText font-display">EURC balance</span>
              <div className="w-8 h-8 rounded-full bg-[#5E2A8C]/10 flex items-center justify-center border border-[#5E2A8C]/20">
                <span className="text-[#B488DC] font-bold text-xs">€</span>
              </div>
            </div>

            {isLoading ? (
              <div className="h-8 w-32 bg-[#1D1D1F]/50 animate-pulse rounded-lg mt-2" />
            ) : (
              <div>
                <h3 className="text-2xl font-extrabold text-white font-mono">
                  {balances.EURC.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-xs text-mutedText mt-1 font-mono">≈ ${eurcUsdVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Swapped this Month Stat */}
        <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText font-display font-semibold">Swapped this month</span>
          {isLoading ? (
            <div className="h-7 w-20 bg-[#1D1D1F]/50 animate-pulse rounded mt-0.5" />
          ) : (
            <span className="text-xl font-bold text-white font-mono">
              ${swappedThisMonth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>

        {/* Payroll Paid (30d) Stat */}
        <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText font-display font-semibold">Payroll paid (30d)</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xl font-bold text-white font-mono">$0</span>
            <span className="text-[8px] bg-borderSubtle text-mutedText px-1.5 py-0.5 rounded font-extrabold tracking-widest uppercase">
              soon
            </span>
          </div>
        </div>

        {/* Active Notes count */}
        <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText font-display font-semibold">Active notes</span>
          {isLoading ? (
            <div className="h-7 w-20 bg-[#1D1D1F]/50 animate-pulse rounded mt-0.5" />
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-bold text-white font-mono">
                {activeShieldedNotesCount}
              </span>
              {activeShieldedNotesCount > 0 && (
                <Badge variant="private">
                  shielded
                </Badge>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Disconnect Alert Overlay banner */}
      {!isConnected && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-6 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white font-display">Wallet Connection Required</h3>
            <p className="text-xs text-mutedText mt-1 max-w-sm">Connect your Stellar wallet to view portfolio metrics, private notes, and transaction logs.</p>
          </div>
          <button
            onClick={connect}
            className="px-5 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display border-none"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Transactions Table Section */}
      <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white font-display">Transactions</h2>
          <div className="flex items-center gap-1.5 bg-[#000000] border border-[#1D1D1F] p-1 rounded-[12px]">
            {(['all', 'swaps', 'payroll'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-[9px] text-xs font-semibold uppercase tracking-wider transition duration-150 font-display ${
                  filter === t
                    ? 'bg-primaryAccent text-white shadow shadow-purple-950/20 font-bold'
                    : 'text-mutedText hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex flex-col divide-y divide-[#1D1D1F]">
          {filteredTransactions.map((tx) => {
            const isDeposit = tx.type === 'deposit';
            return (
              <div
                key={tx.txHash}
                onClick={() => {
                  setSelectedTxHash(tx.txHash);
                  setIsDetailOpen(true);
                }}
                className="py-4 flex items-center justify-between first:pt-0 last:pb-0 group hover:bg-[#1D1D1F]/30 px-3 rounded-[9px] transition duration-150 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-[9px] bg-[#000000] border border-[#1D1D1F] flex items-center justify-center group-hover:border-[#B488DC] transition duration-150">
                    {isDeposit ? (
                      <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-[#B488DC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-[#B488DC] transition duration-150">
                      {isDeposit ? `Deposit to pool` : `Swap withdrawal completed`}
                    </h4>
                    <p className="text-[10px] text-mutedText mt-0.5 font-mono">
                      {isDeposit ? 'USDC commitment' : 'shielded'} · {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-8)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <Badge variant={tx.privacy === 'private' ? 'private' : 'public'}>
                    {tx.privacy}
                  </Badge>
                  <div className="text-right min-w-[110px]">
                    <span className="text-sm font-bold text-white block font-mono">
                      {parseFloat(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.asset}
                    </span>
                    <span className="text-[10px] text-mutedText block mt-0.5 font-mono">
                      {new Date(tx.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          
          {filteredTransactions.length === 0 && (
            <div className="py-12 text-center text-xs text-mutedText font-semibold flex flex-col items-center justify-center gap-2">
              <svg className="w-8 h-8 text-mutedText/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>No transactions recorded.</span>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTxHash(null);
        }}
        transaction={activeTransaction}
        notes={notes}
        exchangeRate={{ numerator: rateNum, denominator: rateDen }}
      />
    </div>
  );
}
