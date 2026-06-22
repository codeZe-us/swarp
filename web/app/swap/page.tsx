'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { createNote, computeNullifier } from '../../lib/note';
import { submitDeposit, submitWithdraw, getTokenBalance } from '../../lib/contracts';
import { USDC_SAC_ID, EURC_SAC_ID } from '../../lib/constants';
import { Badge } from '../../components/ui/Badge';
import { reconstructCommitments } from '../../lib/events';
import { buildTree, getProof, verifyProof } from '../../lib/merkle';
import { generateSwapProof, SwapProofInput } from '../../lib/prover';
import { formatProofForContract } from '../../lib/proof-formatter';

export default function SwapPage() {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  
  // Zustand store mappings
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const addNote = useStore((state) => state.addNote);
  const updateNote = useStore((state) => state.updateNote);
  const markWithdrawn = useStore((state) => state.markWithdrawn);
  const addTransaction = useStore((state) => state.addTransaction);
  const exchangeRate = useStore((state) => state.exchangeRate);
  const fetchPoolState = useStore((state) => state.fetchPoolState);
  const notes = useStore((state) => state.notes);
  
  const isConnected = status === 'connected';

  // Input states (Deposit)
  const [assetIn, setAssetIn] = useState<'USDC' | 'EURC'>('USDC');
  const [amountIn, setAmountIn] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Transaction execution states (Deposit)
  const [depositTxStatus, setDepositTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [depositTxError, setDepositTxError] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositLeafIndex, setDepositLeafIndex] = useState<number | null>(null);

  // Withdraw flow states
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [withdrawStep, setWithdrawStep] = useState<number>(0); // 0: idle, 1: fetching, 2: building, 3: proving, 4: submitting, 5: success
  const [withdrawStatus, setWithdrawStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [workerStage, setWorkerStage] = useState<'loading' | 'computing' | 'proving' | null>(null);
  const [provingSeconds, setProvingSeconds] = useState<number>(0);
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);

  // Balances state (defaulting to mock values)
  const [balances, setBalances] = useState<{ USDC: number; EURC: number }>({
    USDC: 18420.00,
    EURC: 9860.00,
  });

  // Fetch pool state on mount
  useEffect(() => {
    fetchPoolState();
  }, [fetchPoolState]);

  // Sync recipient address with user address when connecting
  useEffect(() => {
    if (isConnected && address && !recipientAddress) {
      setRecipientAddress(address);
    }
  }, [isConnected, address, recipientAddress]);

  // Fetch actual balances if connected and contracts are configured
  useEffect(() => {
    if (isConnected && address) {
      const fetchRealBalances = async () => {
        try {
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

  // Filter notes that are withdrawable (deposited)
  const withdrawableNotes = useMemo(() => {
    return notes.filter((n) => n.status === 'deposited');
  }, [notes]);

  // Determine assetOut based on assetIn for Deposit
  const assetOut = assetIn === 'USDC' ? 'EURC' : 'USDC';

  // Calculate exchange rate
  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  // Compute calculated withdrawal amount in real-time for Deposit
  const calculatedOut = useMemo(() => {
    if (!amountIn || isNaN(parseFloat(amountIn))) return '';
    const val = parseFloat(amountIn);
    const rate = assetIn === 'USDC' ? decimalRate : 1 / decimalRate;
    const out = val * rate;
    return Number(out.toFixed(7)).toString();
  }, [amountIn, assetIn, decimalRate]);

  // Handle amountIn changes with up to 7 decimal places validation
  const handleAmountChange = (val: string) => {
    if (val === '' || /^\d*\.?\d{0,7}$/.test(val)) {
      setAmountIn(val);
      if (depositTxStatus === 'success') {
        setDepositTxStatus('idle');
        setDepositTxHash(null);
        setDepositLeafIndex(null);
      }
    }
  };

  // Flip assets and amounts on swap icon click
  const handleFlipAssets = () => {
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

  // Client-side validations for Deposit
  const depositValidation = useMemo(() => {
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

    if (!depositValidation.isValid || !address) return;

    setDepositTxStatus('loading');
    setDepositTxError(null);
    setDepositTxHash(null);
    setDepositLeafIndex(null);

    try {
      const val = parseFloat(amountIn);
      const amountBigInt = BigInt(Math.round(val * 10_000_000));
      const assetId = assetIn === 'USDC' ? 0 : 1;
      const tokenAddress = assetIn === 'USDC' ? USDC_SAC_ID : EURC_SAC_ID;

      if (!tokenAddress) {
        throw new Error(`Token contract for ${assetIn} is not configured in the environment.`);
      }

      const note = createNote(amountBigInt, assetId);

      const result = await submitDeposit(
        address,
        tokenAddress,
        amountBigInt.toString(),
        note.commitment
      );

      const confirmedNote = {
        ...note,
        leafIndex: result.leafIndex,
        depositTxHash: result.txHash,
        status: 'deposited' as const,
      };

      await addNote(confirmedNote);

      addTransaction({
        type: 'deposit',
        amount: amountIn,
        asset: assetIn,
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'public',
      });

      setDepositLeafIndex(result.leafIndex);
      setDepositTxHash(result.txHash);
      setDepositTxStatus('success');
      setAmountIn('');
    } catch (error: any) {
      console.error('Deposit flow failed:', error);
      setDepositTxError(error?.message || 'Transaction submission failed. Please try again.');
      setDepositTxStatus('error');
    }
  };

  // Format helper for calculated withdrawal field
  const formattedCalculatedOut = useMemo(() => {
    if (!calculatedOut) return '';
    const num = parseFloat(calculatedOut);
    if (isNaN(num)) return '';
    
    const parts = calculatedOut.split('.');
    if (parts.length === 2 && parts[1].length > 2) {
      return num.toFixed(parts[1].length);
    }
    return num.toFixed(2);
  }, [calculatedOut]);

  // Estimate remaining time based on worker stage
  const workerProgressMessage = useMemo(() => {
    if (!workerStage) return '';
    switch (workerStage) {
      case 'loading':
        return `Initializing prover backend... (est. ${Math.max(1, 5 - provingSeconds)}s remaining)`;
      case 'computing':
        return `Solving circuit constraints... (est. ${Math.max(1, 3 - provingSeconds)}s remaining)`;
      case 'proving':
        return `Generating cryptographic proof... (est. ${Math.max(1, 12 - provingSeconds)}s remaining)`;
      default:
        return '';
    }
  }, [workerStage, provingSeconds]);

  // Setup prover timer count-up
  useEffect(() => {
    let timer: any = null;
    if (withdrawStatus === 'loading' && withdrawStep === 3) {
      timer = setInterval(() => {
        setProvingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setProvingSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [withdrawStatus, withdrawStep]);

  // Withdraw transaction execution flow
  const handleWithdraw = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note || !address || !recipientAddress) return;

    setWithdrawStatus('loading');
    setWithdrawError(null);
    setWithdrawTxHash(null);
    setWorkerStage(null);

    // Track active memory secret for zeroing out on completion
    let activeSecret: bigint | null = BigInt(note.secret);

    try {
      // -------------------------------------------------------------
      // Pre-flight check: Verify Pool Reserves in Output Asset
      // -------------------------------------------------------------
      const depositAmountBig = BigInt(note.amount);
      const isUSDCIn = note.asset === 'USDC';
      
      // Calculate exact output withdrawal amount matching contract math
      let withdrawAmountBig: bigint;
      if (isUSDCIn) {
        withdrawAmountBig = (depositAmountBig * BigInt(rateNum)) / BigInt(rateDen);
      } else {
        withdrawAmountBig = (depositAmountBig * BigInt(rateDen)) / BigInt(rateNum);
      }

      // Read reserves from Zanzibar pool state
      const usdcReservesBig = BigInt(useStore.getState().usdcReserves || '0');
      const eurcReservesBig = BigInt(useStore.getState().eurcReserves || '0');
      const reserveAvailable = isUSDCIn ? eurcReservesBig : usdcReservesBig;

      if (reserveAvailable < withdrawAmountBig) {
        throw new Error(
          `Insufficient pool reserves in ${isUSDCIn ? 'EURC' : 'USDC'} to satisfy this withdrawal. ` +
          `Required: ${(Number(withdrawAmountBig) / 10_000_000).toFixed(2)}, ` +
          `Available: ${(Number(reserveAvailable) / 10_000_000).toFixed(2)}.`
        );
      }

      const outputAssetAddress = isUSDCIn ? EURC_SAC_ID : USDC_SAC_ID;
      if (!outputAssetAddress) {
        throw new Error(`Token contract for output asset is not configured in the environment.`);
      }

      // -------------------------------------------------------------
      // Step 1: Fetching pool state
      // -------------------------------------------------------------
      setWithdrawStep(1);
      // Fetch latest roots and leaves from contract
      await fetchPoolState();
      const currentRoot = useStore.getState().merkleRoot;
      if (!currentRoot || currentRoot === '0') {
        throw new Error('Could not fetch active Merkle root from chain.');
      }

      // -------------------------------------------------------------
      // Step 2: Building Merkle proof
      // -------------------------------------------------------------
      setWithdrawStep(2);
      // Reconstruct leaf array from historical commitment events
      const leaves = await reconstructCommitments();
      
      const commitmentBig = BigInt(note.commitment);
      let leafIdx = note.leafIndex;
      if (leafIdx === null) {
        leafIdx = leaves.findIndex((l) => l === commitmentBig);
      }

      if (leafIdx === -1 || leafIdx === null) {
        throw new Error('Note commitment not found in historical deposits list.');
      }

      const rootBigInt = buildTree(leaves);
      const { pathElements, pathIndices } = getProof(leaves, leafIdx);

      // Locally verify the proof path to catch errors before generating witness
      const isProofValid = verifyProof(rootBigInt, commitmentBig, pathElements, pathIndices);
      if (!isProofValid) {
        throw new Error('Local Merkle proof verification failed. Sibling tree elements did not hash to root.');
      }

      // -------------------------------------------------------------
      // Step 3: Generating ZK proof
      // -------------------------------------------------------------
      setWithdrawStep(3);
      const nullifierBig = computeNullifier(commitmentBig, activeSecret);

      const toHex32 = (val: bigint) => '0x' + val.toString(16).padStart(64, '0');

      const witnessInput: SwapProofInput = {
        deposit_amount: note.amount,
        withdrawal_amount: withdrawAmountBig.toString(),
        secret: toHex32(activeSecret),
        asset_in: isUSDCIn ? '0' : '1',
        asset_out: isUSDCIn ? '1' : '0',
        path_elements: pathElements.map((el) => toHex32(el)),
        path_indices: pathIndices,
        exchange_rate: rateNum.toString(),
        rate_denominator: rateDen.toString(),
        nullifier_hash: toHex32(nullifierBig),
        asset_out_public: isUSDCIn ? '1' : '0',
        merkle_root: toHex32(rootBigInt),
      };

      // Trigger Web Worker UltraHonk prover
      const proofResult = await generateSwapProof(witnessInput, (stage) => {
        setWorkerStage(stage);
        setProvingSeconds(0);
      });

      // -------------------------------------------------------------
      // Step 4: Submitting to Stellar
      // -------------------------------------------------------------
      setWithdrawStep(4);
      setWorkerStage(null);

      // Slice prepended public inputs and format for verifier contract
      const { proofHex } = formatProofForContract(proofResult.proof, proofResult.publicInputs);

      // Submit transaction via contracts.ts
      const result = await submitWithdraw(
        recipientAddress,
        outputAssetAddress,
        proofHex,
        nullifierBig.toString(16).padStart(64, '0'),
        rootBigInt.toString(16).padStart(64, '0'),
        withdrawAmountBig.toString()
      );

      // -------------------------------------------------------------
      // Step 5: Success & State updates
      // -------------------------------------------------------------
      setWithdrawStep(5);

      // Zero out active secret in local memory immediately
      activeSecret = null;

      // Update Note to zero out secret and mark status as withdrawn
      await updateNote(note.id, { secret: '0' });
      await markWithdrawn(note.id, result.txHash);

      // Log transaction history
      addTransaction({
        type: 'withdrawal',
        amount: (Number(withdrawAmountBig) / 10_000_000).toString(),
        asset: isUSDCIn ? 'EURC' : 'USDC',
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'private',
      });

      setWithdrawTxHash(result.txHash);
      setWithdrawStatus('success');
      setSelectedNoteId(null);
    } catch (error: any) {
      console.error('Withdraw flow failed:', error);
      
      let failMessage = error?.message || 'Withdrawal transaction failed.';
      
      // Enforce edge case error messaging
      if (failMessage.includes('Contract, #6') || failMessage.includes('InvalidMerkleRoot')) {
        failMessage = 'The Merkle root expired because another transaction was confirmed. Please try again.';
      } else if (failMessage.includes('Contract, #5') || failMessage.includes('NullifierSpent')) {
        failMessage = 'This deposit note has already been withdrawn (nullifier spent).';
      }

      setWithdrawError(failMessage);
      setWithdrawStatus('error');
    } finally {
      // Safeguard: make sure memory references to secrets are wiped
      activeSecret = null;
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto font-sans">
      {/* Header and Subtext */}
      <div>
        <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Application</span>
        <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Private swap</h1>
        <p className="text-sm text-mutedText mt-1">Deposit one stablecoin, withdraw the other — unlinkable.</p>
      </div>

      {/* Custom Tabs Group Selector */}
      <div className="flex justify-center mt-2 mb-4">
        <div className="flex bg-[#0B0B0C] border border-[#1D1D1F] p-1 rounded-[12px] gap-1 w-full max-w-[320px] h-[42px] items-center">
          <button
            onClick={() => setActiveTab('deposit')}
            className={`flex-1 py-1.5 text-center text-xs font-bold rounded-[9px] uppercase tracking-wider transition-all duration-200 h-[32px] flex items-center justify-center border font-display ${
              activeTab === 'deposit'
                ? 'bg-[#1D1D1F] text-white border-[#333336] shadow-sm font-extrabold'
                : 'text-mutedText hover:text-white border-transparent'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setActiveTab('withdraw')}
            className={`flex-1 py-1.5 text-center text-xs font-bold rounded-[9px] uppercase tracking-wider transition-all duration-200 h-[32px] flex items-center justify-center border font-display ${
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
          <div className="w-full max-w-[500px] bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 relative">
            
            {/* Header row inside Card */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-md font-bold text-white font-display">Deposit into pool</h3>
              <Badge variant="private">
                <span className="mr-1">❖</span> SHIELDED
              </Badge>
            </div>

            {/* Input fields stack */}
            <div className="flex flex-col gap-1 relative">
              
              {/* Field 1: You deposit */}
              <div className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-4 flex flex-col gap-1 h-[96px]">
                <div className="flex items-center justify-between text-xs text-mutedText font-semibold">
                  <span>You deposit</span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span>Balance {balances[assetIn].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {isConnected && (
                      <button 
                        onClick={handleMaxClick}
                        className="text-[#B488DC] hover:text-[#D6C2EC] font-bold uppercase transition duration-150 font-display text-[11px]"
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
                    className="bg-transparent border-none outline-none text-white text-3xl font-bold font-mono w-full p-0 placeholder-mutedText/30 focus:ring-0"
                  />
                  
                  {/* Asset In Selector Dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center gap-2 bg-[#0B0B0C] border border-[#1D1D1F] hover:border-mutedText/50 px-3 py-1.5 rounded-[9px] text-white text-sm font-bold shadow transition duration-200 font-display"
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
                          <div className="w-5 h-5 rounded-full bg-[#1A365D] border border-[#5E2A8C]/30 flex items-center justify-center text-purple-300 text-[10px] font-bold font-sans">
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
                      <div className="absolute right-0 mt-2 w-36 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display">
                        <button
                          onClick={() => {
                            if (assetIn !== 'USDC') {
                              setAssetIn('USDC');
                              setAmountIn('');
                            }
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
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
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
                            assetIn === 'EURC'
                              ? 'bg-[#1D1D1F] text-white'
                              : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                          }`}
                        >
                          <div className="w-5 h-5 rounded-full bg-[#1A365D] border border-[#5E2A8C]/30 flex items-center justify-center text-purple-300 text-[9px] font-bold font-sans">
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
                  className="w-9 h-9 rounded-full bg-[#0B0B0C] border border-[#1D1D1F] hover:border-[#5E2A8C] flex items-center justify-center text-mutedText hover:text-white shadow shadow-black transition duration-200"
                >
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* Field 2: You can withdraw */}
              <div className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-4 flex flex-col gap-1 h-[96px]">
                <div className="flex items-center justify-between text-xs text-mutedText font-semibold">
                  <span>You can withdraw</span>
                  <span>after proof</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[#B488DC] text-3xl font-bold font-mono select-all">
                    {formattedCalculatedOut || '0.00'}
                  </div>
                  <div className="flex items-center gap-2 bg-[#0B0B0C]/40 border border-[#1D1D1F]/60 px-3 py-1.5 rounded-[9px] text-white text-sm font-bold select-none cursor-not-allowed">
                    {assetOut === 'USDC' ? (
                      <>
                        <div className="w-5 h-5 rounded-full bg-[#2775CA]/70 flex items-center justify-center text-white/70 text-[10px] font-bold font-sans">
                          $
                        </div>
                        <span className="text-white/70 font-display">USDC</span>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-full bg-[#1A365D]/70 border border-[#5E2A8C]/20 flex items-center justify-center text-purple-300/70 text-[10px] font-bold font-sans">
                          €
                        </div>
                        <span className="text-white/70 font-display">EURC</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Rate row */}
            <div className="flex justify-between items-center text-xs text-mutedText mt-4 font-semibold px-1 font-mono">
              <span className="font-sans">Rate</span>
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
                disabled={depositTxStatus === 'loading' || (isConnected && !depositValidation.isValid)}
                className={`w-full py-3.5 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 font-display ${
                  depositTxStatus === 'loading'
                    ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-wait shadow-none'
                    : isConnected && !depositValidation.isValid
                    ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white active:scale-[0.99] shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none'
                }`}
              >
                {depositTxStatus === 'loading' ? (
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
                  depositValidation.message === 'Deposit' && amountIn
                    ? `Deposit ${amountIn} ${assetIn}`
                    : depositValidation.message
                )}
              </button>
            </div>

            {/* Footer notice */}
            <p className="text-[10px] text-mutedText/60 text-center mt-4 leading-relaxed font-semibold max-w-sm mx-auto">
              The deposit is visible in this transaction. Privacy comes from the withdrawal being unlinkable to it.
            </p>
          </div>

          {/* Tx State Alerts */}
          {depositTxStatus === 'success' && depositTxHash && (
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
                    href={`https://stellar.expert/explorer/testnet/tx/${depositTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white font-bold text-emerald-400"
                  >
                    {depositTxHash.slice(0, 12)}...{depositTxHash.slice(-12)}
                  </a>
                </div>
                {depositLeafIndex !== null && (
                  <div>
                    <span className="text-mutedText">Leaf Index:</span>{' '}
                    <span className="font-bold text-white">{depositLeafIndex}</span>
                  </div>
                )}
                <div className="mt-2 bg-[#000000]/40 border border-amber-500/20 p-3 rounded-lg text-amber-300 font-semibold text-[11px]">
                  ⚠️ Your swap note has been saved securely. If you clear browser data, you will lose access to these funds.
                </div>
              </div>
            </div>
          )}

          {depositTxStatus === 'error' && depositTxError && (
            <div className="w-full max-w-[500px] bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-xs font-semibold text-red-400 leading-relaxed">
                {depositTxError}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Replaced Withdraw Tab with full ZK implementation */
        <div className="flex flex-col gap-6 items-center w-full">
          <div className="w-full max-w-[500px] bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6">
            
            {/* Header row inside Card */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-md font-bold text-white font-display">Withdraw from pool</h3>
              <Badge variant="private">
                <span className="mr-1">❖</span> SHIELDED
              </Badge>
            </div>

            {/* Notes selection list */}
            {withdrawStep === 0 ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-mutedText uppercase tracking-wider">
                    Select Active Shielded Note
                  </label>
                  {withdrawableNotes.length === 0 ? (
                    <div className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-6 text-center text-xs text-mutedText font-semibold flex flex-col items-center justify-center gap-2 min-h-[120px] font-display">
                      <svg className="w-8 h-8 text-mutedText/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v4m16 4H4" />
                      </svg>
                      <span>No pending swaps. Make a deposit first.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                      {withdrawableNotes.map((note) => {
                        const isSelected = selectedNoteId === note.id;
                        const depAmount = Number(note.amount) / 10_000_000;
                        const withRate = note.asset === 'USDC' ? decimalRate : 1 / decimalRate;
                        const withAmount = depAmount * withRate;
                        const withAsset = note.asset === 'USDC' ? 'EURC' : 'USDC';

                        return (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => setSelectedNoteId(isSelected ? null : note.id)}
                            className={`flex items-center justify-between p-4 rounded-[12px] border text-left transition duration-150 ${
                              isSelected
                                ? 'bg-[#5E2A8C]/10 border-[#5E2A8C] text-white'
                                : 'bg-[#000000] border-[#1D1D1F] text-mutedText hover:border-mutedText/50 hover:text-white'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                                <span>{depAmount.toLocaleString('en-US', { maximumFractionDigits: 7 })} {note.asset}</span>
                                <svg className="w-3.5 h-3.5 text-[#B488DC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                                <span className="text-[#B488DC]">{withAmount.toLocaleString('en-US', { maximumFractionDigits: 7 })} {withAsset}</span>
                              </span>
                              <span className="text-[10px] text-mutedText font-semibold mt-1 font-mono">
                                Commitment: {note.commitment.slice(0, 8)}...{note.commitment.slice(-8)}
                              </span>
                            </div>
                            <span className="text-[10px] text-mutedText font-bold font-mono">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recipient Stellar Address */}
                {selectedNoteId && (
                  <div className="flex flex-col gap-1.5 font-display">
                    <label className="text-xs font-bold text-mutedText uppercase tracking-wider">
                      Recipient Stellar Address
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. G..."
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-3.5 text-xs text-white focus:border-[#5E2A8C] focus:ring-0 placeholder-mutedText/30 w-full outline-none font-mono"
                    />
                  </div>
                )}

                {/* Withdraw Submit CTA */}
                <div className="mt-2 font-display">
                  <button
                    onClick={handleWithdraw}
                    disabled={!selectedNoteId || !recipientAddress || withdrawStatus === 'loading'}
                    className={`w-full py-3.5 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 ${
                      !selectedNoteId || !recipientAddress
                        ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white active:scale-[0.99] shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none'
                    }`}
                  >
                    Withdraw
                  </button>
                </div>

                {/* Error Box */}
                {withdrawStatus === 'error' && withdrawError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-xs font-semibold text-red-400 leading-relaxed">
                      {withdrawError}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Execution Multi-step Progress Screen */
              <div className="flex flex-col gap-6 py-2">
                <div className="flex flex-col gap-4">
                  {[
                    { id: 1, label: "Fetching pool state..." },
                    { id: 2, label: "Building Merkle proof..." },
                    { id: 3, label: "Generating ZK proof..." },
                    { id: 4, label: "Submitting to Stellar..." },
                    { id: 5, label: "Swap complete!" }
                  ].map((step) => {
                    const isActive = withdrawStep === step.id && withdrawStatus === 'loading';
                    const isCompleted = withdrawStep > step.id || (step.id === 5 && withdrawStep === 5 && withdrawStatus === 'success');
                    const isFailed = withdrawStep === step.id && withdrawStatus === 'error';
                    
                    return (
                      <div key={step.id} className="flex items-center justify-between p-3.5 rounded-[12px] border border-[#1D1D1F] bg-[#000000]/60">
                        <div className="flex items-center gap-3">
                          {/* Step visual badge */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition duration-200 ${
                            isCompleted
                              ? 'bg-emerald-500 text-white'
                              : isFailed
                              ? 'bg-red-500 text-white'
                              : isActive
                              ? 'bg-[#5E2A8C] text-white animate-pulse'
                              : 'bg-[#1D1D1F] text-mutedText border border-[#333336]'
                          }`}>
                            {isCompleted ? (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : isFailed ? (
                              <span>✕</span>
                            ) : (
                              <span>{step.id}</span>
                            )}
                          </div>
                          
                          <div className="flex flex-col">
                            <span className={`text-xs font-bold transition duration-150 font-display ${
                              isActive ? 'text-white font-extrabold' : isCompleted ? 'text-slate-300' : 'text-mutedText'
                            }`}>
                              {step.label}
                            </span>
                            {/* Prover details for step 3 */}
                            {step.id === 3 && isActive && (
                              <span className="text-[10px] text-[#B488DC] font-bold mt-1.5 animate-pulse font-mono">
                                {workerProgressMessage || 'Preparing prover (Aztec Barretenberg)...'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side loader/check visual */}
                        <div>
                          {isActive && (
                            <svg className="animate-spin h-4 w-4 text-[#5E2A8C]" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Final transaction hash result / action rows */}
                {withdrawStatus === 'success' && withdrawTxHash && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-3 mt-2">
                    <div className="text-xs text-slate-300 flex flex-col gap-1.5 font-medium leading-relaxed">
                      <div className="font-bold text-emerald-400 text-sm flex items-center gap-1.5">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Withdrawal Completed
                      </div>
                      <div className="mt-1">
                        <span className="text-mutedText">Transaction Hash:</span>{' '}
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${withdrawTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-white font-bold text-emerald-400"
                        >
                          {withdrawTxHash.slice(0, 12)}...{withdrawTxHash.slice(-12)}
                        </a>
                      </div>
                      <p className="text-[10px] text-mutedText mt-1.5">
                        The note secret has been successfully zeroed out in memory and stored state. Note spent.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawStatus('idle');
                        setWithdrawStep(0);
                        setWithdrawTxHash(null);
                      }}
                      className="w-full mt-2 py-2 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-400 font-bold rounded-xl text-xs uppercase tracking-wider transition duration-150"
                    >
                      Done
                    </button>
                  </div>
                )}

                {withdrawStatus === 'error' && (
                  <div className="flex flex-col gap-3 mt-2">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="text-xs font-semibold text-red-400 leading-relaxed">
                        {withdrawError || 'Prover or submission failed.'}
                      </div>
                    </div>
                    <div className="flex gap-2 font-display">
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawStatus('idle');
                          setWithdrawStep(0);
                        }}
                        className="flex-1 py-3 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 bg-transparent"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        className="flex-1 py-3 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[12px] text-xs uppercase tracking-wider transition duration-150 shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none"
                      >
                        Retry Step
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-mutedText/60 text-center mt-4 leading-relaxed font-semibold max-w-sm mx-auto">
              Zero-knowledge proof generation and validation are run locally in the browser before submitting to Soroban.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
