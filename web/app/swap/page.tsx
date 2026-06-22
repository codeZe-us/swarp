'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { createNote } from '../../lib/note';
import { submitDeposit, getTokenBalance } from '../../lib/contracts';
import { USDC_SAC_ID, EURC_SAC_ID } from '../../lib/constants';
import { Badge } from '../../components/ui/Badge';

export default function SwapPage() {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  
  // Wallet state from Zustand store
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const addNote = useStore((state) => state.addNote);
  const addTransaction = useStore((state) => state.addTransaction);
  const exchangeRate = useStore((state) => state.exchangeRate);
  const fetchPoolState = useStore((state) => state.fetchPoolState);
  
  const isConnected = status === 'connected';

  // Input states
  const [assetIn, setAssetIn] = useState<'USDC' | 'EURC'>('USDC');
  const [amountIn, setAmountIn] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Transaction execution states
  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [txError, setTxError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [leafIndex, setLeafIndex] = useState<number | null>(null);

  // Balances state (defaulting to mock values)
  const [balances, setBalances] = useState<{ USDC: number; EURC: number }>({
    USDC: 18420.00,
    EURC: 9860.00,
  });

  // Load pool state on mount
  useEffect(() => {
    fetchPoolState();
  }, [fetchPoolState]);

  // Fetch actual balances if connected and contracts are configured
  useEffect(() => {
    if (isConnected && address) {
      const fetchRealBalances = async () => {
        try {
          // If contract addresses are set, fetch real balances
          if (USDC_SAC_ID && EURC_SAC_ID) {
            const usdcBal = await getTokenBalance(address, USDC_SAC_ID);
            const eurcBal = await getTokenBalance(address, EURC_SAC_ID);
            
            setBalances({
              USDC: Number(usdcBal) / 10_000_000,
              EURC: Number(eurcBal) / 10_000_000,
            });
          }
        } catch (e) {
          console.warn('Failed to fetch real balances, using fallback mock values:', e);
        }
      };
      fetchRealBalances();
    } else {
      // Reset to default mock values when disconnected
      setBalances({
        USDC: 18420.00,
        EURC: 9860.00,
      });
    }
  }, [isConnected, address]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine assetOut based on assetIn
  const assetOut = assetIn === 'USDC' ? 'EURC' : 'USDC';

  // Calculate exchange rate
  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  // Compute calculated withdrawal amount in real-time
  const calculatedOut = useMemo(() => {
    if (!amountIn || isNaN(parseFloat(amountIn))) return '';
    const val = parseFloat(amountIn);
    const rate = assetIn === 'USDC' ? decimalRate : 1 / decimalRate;
    const out = val * rate;
    
    // Format output to avoid floating point precision issues (max 7 decimals)
    return Number(out.toFixed(7)).toString();
  }, [amountIn, assetIn, decimalRate]);

  // Handle amountIn changes with up to 7 decimal places validation
  const handleAmountChange = (val: string) => {
    if (val === '' || /^\d*\.?\d{0,7}$/.test(val)) {
      setAmountIn(val);
      // Reset success status if user types a new amount
      if (txStatus === 'success') {
        setTxStatus('idle');
        setTxHash(null);
        setLeafIndex(null);
      }
    }
  };

  // Flip assets and amounts on swap icon click
  const handleFlipAssets = () => {
    const previousAssetIn = assetIn;
    const previousAmountIn = amountIn;
    
    setAssetIn(assetOut);
    
    if (calculatedOut) {
      setAmountIn(calculatedOut);
    } else {
      setAmountIn('');
    }
  };

  // Max button fill
  const handleMaxClick = () => {
    const maxBalance = balances[assetIn];
    setAmountIn(maxBalance.toString());
  };

  // Client-side validations
  const validation = useMemo(() => {
    if (!amountIn) {
      return { isValid: false, message: 'Enter an amount' };
    }
    const val = parseFloat(amountIn);
    if (isNaN(val) || val <= 0) {
      return { isValid: false, message: 'Amount must be greater than 0' };
    }
    
    const balance = balances[assetIn];
    if (val > balance) {
      return { isValid: false, message: 'Insufficient balance' };
    }

    // Stellar raw amount fits in signed 64-bit integer limit: 922337203685.4775807
    const baseUnits = Math.round(val * 10_000_000);
    const maxI64 = BigInt('9223372036854775807');
    if (BigInt(baseUnits) > maxI64) {
      return { isValid: false, message: 'Amount exceeds maximum limit' };
    }

    return { isValid: true, message: 'Deposit' };
  }, [amountIn, assetIn, balances]);

  // Deposit transaction submission flow
  const handleDeposit = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    if (!validation.isValid || !address) return;

    setTxStatus('loading');
    setTxError(null);
    setTxHash(null);
    setLeafIndex(null);

    try {
      const val = parseFloat(amountIn);
      const amountBigInt = BigInt(Math.round(val * 10_000_000));
      const assetId = assetIn === 'USDC' ? 0 : 1;
      const tokenAddress = assetIn === 'USDC' ? USDC_SAC_ID : EURC_SAC_ID;

      if (!tokenAddress) {
        throw new Error(`Token contract for ${assetIn} is not configured in the environment.`);
      }

      // 1. Generate internal cryptographic note parameters
      const note = createNote(amountBigInt, assetId);

      // 2. Submit transaction to Soroban
      const result = await submitDeposit(
        address,
        tokenAddress,
        amountBigInt.toString(),
        note.commitment
      );

      // 3. Update note with leaf index and transaction details
      const confirmedNote = {
        ...note,
        leafIndex: result.leafIndex,
        depositTxHash: result.txHash,
        status: 'deposited' as const,
      };

      // 4. Save note in encrypted local storage via Zustand slice
      await addNote(confirmedNote);

      // 5. Add to transaction history
      addTransaction({
        type: 'deposit',
        amount: amountIn,
        asset: assetIn,
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'public',
      });

      // 6. Set success state
      setLeafIndex(result.leafIndex);
      setTxHash(result.txHash);
      setTxStatus('success');
      setAmountIn('');
    } catch (error: any) {
      console.error('Deposit flow failed:', error);
      setTxError(error?.message || 'Transaction submission failed. Please try again.');
      setTxStatus('error');
    }
  };

  // Format helper for calculated withdrawal field
  const formattedCalculatedOut = useMemo(() => {
    if (!calculatedOut) return '';
    const num = parseFloat(calculatedOut);
    if (isNaN(num)) return '';
    
    // If output has more than 2 decimal places, show them, otherwise show 2 decimals
    const parts = calculatedOut.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      return num.toFixed(parts[1].length);
    }
    return num.toFixed(2);
  }, [calculatedOut]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      {/* Header and Subtext */}
      <div>
        <span className="text-[10px] font-bold text-[#7C3AED] tracking-wider uppercase">Application</span>
        <h1 className="text-3xl font-extrabold text-white mt-1">Private swap</h1>
        <p className="text-sm text-mutedText mt-1">Deposit one stablecoin, withdraw the other — unlinkable.</p>
      </div>

      {/* Custom Tabs Group Selector */}
      <div className="flex justify-center mt-2 mb-4">
        <div className="flex bg-[#0B0B0C] border border-[#1D1D1F] p-1 rounded-xl gap-1 w-full max-w-[320px] h-[42px] items-center">
          <button
            onClick={() => setActiveTab('deposit')}
            className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg uppercase tracking-wider transition-all duration-200 h-[32px] flex items-center justify-center border ${
              activeTab === 'deposit'
                ? 'bg-[#1D1D1F] text-white border-[#333336] shadow-sm font-extrabold'
                : 'text-mutedText hover:text-white border-transparent'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg uppercase tracking-wider transition-all duration-200 h-[32px] flex items-center justify-center border ${
              activeTab === 'withdraw'
                ? 'bg-[#1D1D1F] text-white border-[#333336] shadow-sm font-extrabold'
                : 'text-mutedText hover:text-white border-transparent'
            }`}
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Main swap container */}
      {activeTab === 'deposit' ? (
        <div className="flex flex-col gap-6 items-center">
          {/* Deposit Card */}
          <div className="w-full max-w-[500px] bg-[#0B0B0C] border border-[#1D1D1F] rounded-2xl p-6 relative">
            
            {/* Header row inside Card */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-md font-bold text-white">Deposit into pool</h3>
              <Badge variant="private">
                <span className="mr-1">❖</span> SHIELDED
              </Badge>
            </div>

            {/* Input fields stack */}
            <div className="flex flex-col gap-1 relative">
              
              {/* Field 1: You deposit */}
              <div className="bg-[#000000] border border-[#1D1D1F] rounded-xl p-4 flex flex-col gap-1 h-[96px]">
                <div className="flex items-center justify-between text-xs text-mutedText font-semibold">
                  <span>You deposit</span>
                  <div className="flex items-center gap-1.5">
                    <span>Balance {balances[assetIn].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {isConnected && (
                      <button 
                        onClick={handleMaxClick}
                        className="text-[#7C3AED] hover:text-[#9F67FF] font-bold uppercase transition duration-150"
                      >
                        Max
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={amountIn}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="bg-transparent border-none outline-none text-white text-3xl font-extrabold w-full p-0 placeholder-mutedText/30 focus:ring-0"
                  />
                  
                  {/* Asset In Selector Dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center gap-2 bg-[#0B0B0C] border border-[#1D1D1F] hover:border-mutedText/50 px-3 py-1.5 rounded-full text-white text-sm font-bold shadow transition duration-200"
                    >
                      {assetIn === 'USDC' ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-[#2775CA] flex items-center justify-center text-white text-[10px] font-bold font-sans">
                            $
                          </div>
                          <span>USDC</span>
                        </>
                      ) : (
                        <>
                          <div className="w-5 h-5 rounded-full bg-[#1A365D] border border-purple-500/30 flex items-center justify-center text-purple-300 text-[10px] font-bold font-sans">
                            €
                          </div>
                          <span>EURC</span>
                        </>
                      )}
                      <svg className={`w-3.5 h-3.5 text-mutedText transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-36 bg-[#0B0B0C] border border-[#1D1D1F] rounded-xl shadow-xl z-50 p-1">
                        <button
                          onClick={() => {
                            if (assetIn !== 'USDC') {
                              setAssetIn('USDC');
                              setAmountIn('');
                            }
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition duration-150 ${
                            assetIn === 'USDC'
                              ? 'bg-[#1D1D1F] text-white'
                              : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                          }`}
                        >
                          <div className="w-5 h-5 rounded-full bg-[#2775CA] flex items-center justify-center text-white text-[9px] font-bold font-sans">
                            $
                          </div>
                          USDC
                        </button>
                        <button
                          onClick={() => {
                            if (assetIn !== 'EURC') {
                              setAssetIn('EURC');
                              setAmountIn('');
                            }
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition duration-150 ${
                            assetIn === 'EURC'
                              ? 'bg-[#1D1D1F] text-white'
                              : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                          }`}
                        >
                          <div className="w-5 h-5 rounded-full bg-[#1A365D] border border-purple-500/30 flex items-center justify-center text-purple-300 text-[9px] font-bold font-sans">
                            €
                          </div>
                          EURC
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Overlapping Swap Direction Button */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <button
                  onClick={handleFlipAssets}
                  className="w-9 h-9 rounded-full bg-[#0B0B0C] border border-[#1D1D1F] hover:border-[#7C3AED] flex items-center justify-center text-mutedText hover:text-white shadow shadow-black transition duration-200"
                >
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* Field 2: You can withdraw */}
              <div className="bg-[#000000] border border-[#1D1D1F] rounded-xl p-4 flex flex-col gap-1 h-[96px]">
                <div className="flex items-center justify-between text-xs text-mutedText font-semibold">
                  <span>You can withdraw</span>
                  <span>after proof</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[#C084FC] text-3xl font-extrabold select-all">
                    {formattedCalculatedOut || '0.00'}
                  </div>
                  <div className="flex items-center gap-2 bg-[#0B0B0C]/40 border border-[#1D1D1F]/60 px-3 py-1.5 rounded-full text-white text-sm font-bold select-none cursor-not-allowed">
                    {assetOut === 'USDC' ? (
                      <>
                        <div className="w-5 h-5 rounded-full bg-[#2775CA]/70 flex items-center justify-center text-white/70 text-[10px] font-bold font-sans">
                          $
                        </div>
                        <span className="text-white/70">USDC</span>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-full bg-[#1A365D]/70 border border-purple-500/20 flex items-center justify-center text-purple-300/70 text-[10px] font-bold font-sans">
                          €
                        </div>
                        <span className="text-white/70">EURC</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Rate row */}
            <div className="flex justify-between items-center text-xs text-mutedText mt-4 font-semibold px-1">
              <span>Rate</span>
              <span className="text-white font-bold">
                {assetIn === 'USDC'
                  ? `1 USDC = ${decimalRate.toFixed(4)} EURC`
                  : `1 EURC = ${(1 / decimalRate).toFixed(4)} USDC`}
              </span>
            </div>

            {/* Deposit CTA Button */}
            <div className="mt-5">
              <button
                onClick={handleDeposit}
                disabled={txStatus === 'loading' || (isConnected && !validation.isValid)}
                className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 ${
                  txStatus === 'loading'
                    ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-wait'
                    : isConnected && !validation.isValid
                    ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-not-allowed'
                    : 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white active:scale-[0.99] shadow-md shadow-purple-950/20'
                }`}
              >
                {txStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Processing Transaction...</span>
                  </>
                ) : !isConnected ? (
                  'Connect wallet to deposit'
                ) : (
                  validation.message === 'Deposit' && amountIn
                    ? `Deposit ${amountIn} ${assetIn}`
                    : validation.message
                )}
              </button>
            </div>

            {/* Footer notice */}
            <p className="text-[10px] text-mutedText/60 text-center mt-4 leading-relaxed font-semibold max-w-sm mx-auto">
              The deposit is visible in this transaction. Privacy comes from the withdrawal being unlinkable to it.
            </p>
          </div>

          {/* Tx State Alerts */}
          {txStatus === 'success' && txHash && (
            <div className="w-full max-w-[500px] bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-bold text-emerald-400">Deposit Completed Successfully</span>
              </div>
              <div className="text-xs text-slate-300 flex flex-col gap-1.5 font-medium leading-relaxed">
                <div>
                  <span className="text-mutedText">Transaction Hash:</span>{' '}
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white font-bold text-emerald-400"
                  >
                    {txHash.slice(0, 12)}...{txHash.slice(-12)}
                  </a>
                </div>
                {leafIndex !== null && (
                  <div>
                    <span className="text-mutedText">Leaf Index:</span>{' '}
                    <span className="font-bold text-white">{leafIndex}</span>
                  </div>
                )}
                <div className="mt-2 bg-[#000000]/40 border border-amber-500/20 p-3 rounded-lg text-amber-300 font-semibold text-[11px]">
                  ⚠️ Your swap note has been saved securely. If you clear browser data, you will lose access to these funds.
                </div>
              </div>
            </div>
          )}

          {txStatus === 'error' && txError && (
            <div className="w-full max-w-[500px] bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-xs font-semibold text-red-400 leading-relaxed">
                {txError}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* High-fidelity Withdraw placeholder showing active notes */
        <WithdrawTabPlaceholder balances={balances} />
      )}
    </div>
  );
}

// Inner helper component for the Withdraw tab to keep active notes list functional
function WithdrawTabPlaceholder({ balances }: { balances: { USDC: number; EURC: number } }) {
  const notes = useStore((state) => state.notes);
  const activeNotes = useMemo(() => notes.filter(n => n.status === 'deposited'), [notes]);
  const [recipient, setRecipient] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const selectedNote = useMemo(() => {
    return activeNotes.find(n => n.id === selectedNoteId);
  }, [activeNotes, selectedNoteId]);

  return (
    <div className="flex flex-col gap-6 items-center w-full">
      <div className="w-full max-w-[500px] bg-[#0B0B0C] border border-[#1D1D1F] rounded-2xl p-6">
        
        {/* Header row inside Card */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-md font-bold text-white">Withdraw from pool</h3>
          <Badge variant="private">
            <span className="mr-1">❖</span> SHIELDED
          </Badge>
        </div>

        {/* Notes selection list */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold text-mutedText uppercase tracking-wider">
            Select Active Shielded Note
          </label>
          {activeNotes.length === 0 ? (
            <div className="bg-[#000000] border border-[#1D1D1F] rounded-xl p-4 text-center text-xs text-mutedText font-medium">
              No active shielded deposits found for this wallet. Create a deposit first.
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-36 overflow-y-auto pr-1">
              {activeNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id === selectedNoteId ? null : note.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition duration-150 ${
                    selectedNoteId === note.id
                      ? 'bg-primaryAccent/10 border-primaryAccent text-white'
                      : 'bg-[#000000] border-[#1D1D1F] text-mutedText hover:border-mutedText/50 hover:text-white'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold text-white">
                      {(Number(note.amount) / 10_000_000).toLocaleString('en-US')} {note.asset} Note
                    </span>
                    <span className="text-[10px] text-mutedText">
                      Commitment: {note.commitment.slice(0, 6)}...{note.commitment.slice(-6)}
                    </span>
                  </div>
                  <span className="text-[10px] text-mutedText font-semibold">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Manual input for custom notes */}
          <div className="flex flex-col gap-1.5 mt-2">
            <label className="text-xs font-bold text-mutedText uppercase tracking-wider">
              Recipient Stellar Address
            </label>
            <input
              type="text"
              placeholder="e.g. G..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="bg-[#000000] border border-[#1D1D1F] rounded-xl p-3.5 text-xs text-white focus:border-[#7C3AED] focus:ring-0 placeholder-mutedText/30 w-full outline-none font-mono"
            />
          </div>

          {/* CTA withdraw */}
          <div className="mt-4">
            <button
              disabled={true}
              className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide bg-[#1D1D1F] text-mutedText border border-[#333336] uppercase opacity-75 cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <span>Withdrawal Available on Mainnet</span>
            </button>
          </div>

          <p className="text-[10px] text-mutedText/60 text-center mt-3 leading-relaxed font-semibold max-w-sm mx-auto">
            Zero-knowledge proof generation and validation are run locally in the browser before submitting to Soroban.
          </p>
        </div>
      </div>
    </div>
  );
}
