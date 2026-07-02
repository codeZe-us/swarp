'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useStore } from '../../store/useStore';
import { createNote, computeNullifier } from '../../lib/note';
import { submitDeposit, submitVerifyWithdrawal, submitExecuteWithdrawal, getTokenBalance, establishTrustline } from '../../lib/contracts';
import { Badge } from '../../components/ui/Badge';
import { reconstructCommitments, fetchDepositEvents } from '../../lib/events';
import { buildTree, getProof, verifyProof, computeRootFromPath } from '../../lib/merkle';
import { generateSwapProof, SwapProofInput } from '../../lib/prover';
import { ASSETS, getAssetByCode, getAssetById } from '../../lib/assets';
import { getRate, getReserves, getMerkleRoot } from '../../lib/contracts';
import { formatProofForContract } from '../../lib/proof-formatter';
import { handleError } from '../../lib/errors';
import { ShimmerLoader } from '../../components/ui/ShimmerLoader';
import { useToastStore } from '../../store/useToast';

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
  const config = useStore((state) => state.config);
  
  const isConnected = status === 'connected';

  // Input states (Deposit)
  const [assetInCode, setAssetInCode] = useState<string>('USDC');
  const [assetOutCode, setAssetOutCode] = useState<string>('EURC');
  const [amountIn, setAmountIn] = useState<string>('');
  const [isDropdownInOpen, setIsDropdownInOpen] = useState(false);
  const [isDropdownOutOpen, setIsDropdownOutOpen] = useState(false);
  const dropdownInRef = useRef<HTMLDivElement>(null);
  const dropdownOutRef = useRef<HTMLDivElement>(null);
  const [withdrawAssetOutCode, setWithdrawAssetOutCode] = useState<string>('EURC');
  const [canResumeNoteId, setCanResumeNoteId] = useState<string | null>(null);
  const [isWithdrawDropdownOpen, setIsWithdrawDropdownOpen] = useState(false);
  const withdrawDropdownRef = useRef<HTMLDivElement>(null);

  // Transaction execution states (Deposit)
  const [depositTxStatus, setDepositTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositLeafIndex, setDepositLeafIndex] = useState<number | null>(null);

  // Funding state
  const [isFunding, setIsFunding] = useState(false);

  // Withdraw flow states
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState<string>('');
  const [withdrawStep, setWithdrawStep] = useState<number>(0); // 0: idle, 1: fetching, 2: building, 3: proving, 4: submitting, 5: success
  const [withdrawStatus, setWithdrawStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [workerStage, setWorkerStage] = useState<'loading' | 'computing' | 'proving' | null>(null);
  const [provingSeconds, setProvingSeconds] = useState<number>(0);
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);

  // Balances state (defaulting to mock values)
  const [balances, setBalances] = useState<{ [key: string]: number }>({
    USDC: 18420.00,
    EURC: 9860.00,
    MGUSD: 0,
    YLDS: 0,
    XLM: 0,
  });

  const [currentRate, setCurrentRate] = useState<{ numerator: number; denominator: number }>({ numerator: 9200000, denominator: 10000000 });
  const [isFetchingData, setIsFetchingData] = useState(true);

  // Fetch pool state on mount
  useEffect(() => {
    fetchPoolState();
  }, [fetchPoolState]);

  // Parse noteId query parameter for withdrawal pre-selection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const noteId = params.get('noteId');
      if (noteId) {
        setSelectedNoteId(noteId);
        setActiveTab('withdraw');
      }
    }
  }, []);

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
          // In mock mode, getTokenBalance handles undefined SAC IDs
          const balancePromises = ASSETS.map(async (asset) => {
            const sacId = (config as any)[`${asset.code}_SAC_ID`];
            if (sacId) {
              try {
                const bal = await getTokenBalance(address, sacId);
                return { code: asset.code, bal: Number(bal) / 10_000_000 };
              } catch (e) {
                console.warn(`Failed to fetch balance for ${asset.code}`, e);
                return { code: asset.code, bal: 0 };
              }
            }
            return { code: asset.code, bal: 0 };
          });
          
          const results = await Promise.all(balancePromises);
          const newBalances: Record<string, number> = {};
          for (const res of results) {
            newBalances[res.code] = res.bal;
          }
          setBalances(prev => ({...prev, ...newBalances}));
        } catch (e) {
          console.warn('Failed to fetch real balances, using fallback mock values:', e);
        } finally {
          setIsFetchingData(false);
        }
      };
      fetchRealBalances();
    } else {
      setBalances({
        USDC: 0,
        EURC: 0,
        MGUSD: 0,
        YLDS: 0,
        XLM: 0,
      });
      setIsFetchingData(false);
    }
  }, [isConnected, address]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownInRef.current && !dropdownInRef.current.contains(event.target as Node)) setIsDropdownInOpen(false);
      if (dropdownOutRef.current && !dropdownOutRef.current.contains(event.target as Node)) setIsDropdownOutOpen(false);
      if (withdrawDropdownRef.current && !withdrawDropdownRef.current.contains(event.target as Node)) setIsWithdrawDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
  // Add any additional states or refs if necessary

  return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter notes that are withdrawable (deposited)
  const withdrawableNotes = useMemo(() => {
    return notes.filter((n) => n.status === 'deposited');
  }, [notes]);

  // Fetch pair rate

  useEffect(() => {
    const fetchPairRate = async () => {
      const assetIn = getAssetByCode(assetInCode);
      const assetOut = getAssetByCode(assetOutCode);
      if (assetIn && assetOut && assetIn.id !== assetOut.id) {
        try {
          const rate = await getRate(assetIn.id, assetOut.id);
          setCurrentRate(rate);
        } catch (e) {
          console.warn('Failed to fetch pair rate', e);
        }
      }
    };
    fetchPairRate();
  }, [assetInCode, assetOutCode]);


  // Calculate exchange rate
  const rateNum = currentRate.numerator;
  const rateDen = currentRate.denominator;
  const decimalRate = rateNum / rateDen;

  // Compute calculated withdrawal amount in real-time for Deposit
  const calculatedOut = useMemo(() => {
    if (!amountIn || isNaN(parseFloat(amountIn))) return '';
    const val = parseFloat(amountIn);
    const out = val * decimalRate;
    return Number(out.toFixed(7)).toString();
  }, [amountIn, decimalRate]);

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
    setAssetInCode(assetOutCode);
    setAssetOutCode(assetInCode);
    if (calculatedOut) {
      setAmountIn(calculatedOut);
    } else {
      setAmountIn('');
    }
  };

  // Max button fill
  const handleMaxClick = () => {
    const maxBalance = balances[assetInCode];
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
    
    const balance = balances[assetInCode];
    if (val > balance) {
      return { isValid: false, message: 'Insufficient balance' };
    }

    const baseUnits = Math.round(val * 10_000_000);
    const maxI64 = BigInt('9223372036854775807');
    if (BigInt(baseUnits) > maxI64) {
      return { isValid: false, message: 'Amount exceeds maximum limit' };
    }

    return { isValid: true, message: 'Deposit' };
  }, [amountIn, assetInCode, balances]);

  // Deposit transaction submission flow
  const handleDeposit = async () => {
    if (!isConnected) {
      connect();
      return;
    }

    if (!depositValidation.isValid || !address) return;

    setDepositTxStatus('loading');
    setDepositTxHash(null);
    setDepositLeafIndex(null);

    try {
      const val = parseFloat(amountIn);
      const amountBigInt = BigInt(Math.round(val * 10_000_000));
      const assetId = getAssetByCode(assetInCode)?.id || 0;
      const tokenAddress = (config as any)[`${assetInCode}_SAC_ID`] || '';

      if (!tokenAddress) {
        console.warn(`MOCK MODE: Token contract for ${assetInCode} is not configured.`);
      }

      const poolContractId = (config as any)?.POOL_CONTRACT_ID;
      const note = createNote(amountBigInt, assetId, poolContractId);

      // note.commitment is stored as a decimal BigInt string from poseidon2Hash.
      // submitDeposit() expects a 64-char hex string for encoding as bytes32.
      const commitmentHex = BigInt(note.commitment).toString(16).padStart(64, '0');

      const result = await submitDeposit(
        address,
        assetId,
        amountBigInt.toString(),
        commitmentHex
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
        asset: assetInCode,
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'public',
      });

      setDepositLeafIndex(result.leafIndex);
      setDepositTxHash(result.txHash);
      setDepositTxStatus('success');
      setAmountIn('');
      useToastStore.getState().addToast({ title: 'Success', message: `Deposit Completed Successfully! Tx Hash: ${result.txHash.slice(0, 12)}...`, severity: 'success' });
    } catch (error: unknown) {
      console.error('Deposit flow failed:', error);
      const zError = handleError(error, 'transaction');
      setDepositTxStatus('error');
      useToastStore.getState().addToast({ title: 'Error', message: zError.message || 'Deposit failed.', severity: 'error' });
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
    setWithdrawTxHash(null);
    setWorkerStage(null);

    // Track active memory secret for zeroing out on completion
    let activeSecret: bigint | null = BigInt(note.secret);

    try {
      // -------------------------------------------------------------
      // Pre-flight check: Verify Pool Reserves in Output Asset
      // -------------------------------------------------------------
      const depositAmountBig = BigInt(note.amount);
      const isUSDCIn = false; // obsolete variable
      
      // We need to fetch the rate for the specific pair (note.asset -> withdrawAssetOutCode)
      const depositAsset = getAssetByCode(note.asset);
      const withdrawAsset = getAssetByCode(withdrawAssetOutCode);
      if (!depositAsset || !withdrawAsset) throw new Error('Invalid asset');
      
      if (depositAsset.id === withdrawAsset.id) {
        throw new Error('Deposit and withdrawal assets cannot be the same (no same-asset swaps). Please select a different asset to receive.');
      }
      
      const withdrawRate = await getRate(depositAsset.id, withdrawAsset.id, note.poolContractId);
      const withdrawAmountBig = (depositAmountBig * BigInt(withdrawRate.numerator)) / BigInt(withdrawRate.denominator);

      // Read reserves directly for the pool
      const poolReserves = await getReserves(note.poolContractId);
      const reserveAvailable = poolReserves.length > withdrawAsset.id ? poolReserves[withdrawAsset.id] : BigInt(0);

      if (reserveAvailable < withdrawAmountBig) {
        throw new Error(
          `Insufficient pool reserves in ${withdrawAssetOutCode} to satisfy this withdrawal. ` +
          `Required: ${(Number(withdrawAmountBig) / 10_000_000).toFixed(2)}, ` +
          `Available: ${(Number(reserveAvailable) / 10_000_000).toFixed(2)}.`
        );
      }

      const outputAssetAddress = (config as any)[`${withdrawAssetOutCode}_SAC_ID`] || '';
      if (!outputAssetAddress) {
        console.warn(`MOCK MODE: Token contract for output asset is not configured.`);
      }

      // -------------------------------------------------------------
      // Step 1: Fetching pool state
      // -------------------------------------------------------------
      setWithdrawStep(1);
      // We don't call fetchPoolState() here as it updates the global store, 
      // instead we just query the root directly for the specific pool.
      const currentRoot = await getMerkleRoot(note.poolContractId);
      // merkleRoot is plain 64-char hex (no 0x). Empty string or all-zeros means not initialized.
      if (!currentRoot || /^0+$/.test(currentRoot)) {
        throw new Error('Could not fetch active Merkle root from chain.');
      }

      // -------------------------------------------------------------
      // Step 2: Building Merkle proof
      // -------------------------------------------------------------
      setWithdrawStep(2);
      // Reconstruct leaf array from historical commitment events for the specific pool
      const leaves = await reconstructCommitments(note.poolContractId);
      
      const commitmentBig = BigInt(note.commitment);
      const commitmentHex = note.commitment;
      
      // Before the commitment search
      const events = await fetchDepositEvents(undefined, note.poolContractId);
      console.log('=== EVENT DEBUG ===');
      console.log('Pool contract being queried:', note.poolContractId);
      console.log('Total events found:', events.length);
      console.log('Looking for commitment:', commitmentHex);
      if (events.length > 0) {
        console.log('First 3 event commitments:', events.slice(0, 3).map(e => e.commitment));
      }
      console.log('===================');
      // Always look up commitment in event-reconstructed leaves — the stored
      // leafIndex may have been incorrectly set to 0 for all deposits.
      let leafIdx: number = leaves.findIndex((l) => l === commitmentBig);
      if (leafIdx === -1) {
        // Fallback: trust the stored leafIndex only if findIndex failed
        // (e.g., events window is pruned and the old deposit is no longer queryable)
        if (note.leafIndex !== null && note.leafIndex !== undefined) {
          leafIdx = note.leafIndex;
          console.warn(
            `Commitment not found in on-chain events (possibly pruned). ` +
            `Falling back to stored leafIndex=${leafIdx}. Proof may fail if index is wrong.`
          );
        } else if (!config?.POOL_CONTRACT_ID) {
          leafIdx = 0; // mock mode fallback
        } else {
          throw new Error(
            'Note commitment not found in historical deposit events. ' +
            'Events may be pruned or the deposit was never confirmed on-chain.'
          );
        }
      }

      let rootBigInt = buildTree(leaves);
      const { pathElements, pathIndices } = getProof(leaves, leafIdx);

      // MOCK MODE: Fix root to be valid!
      if (!config?.POOL_CONTRACT_ID) {
         rootBigInt = computeRootFromPath(commitmentBig, pathElements, pathIndices);
      }

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
        asset_in: depositAsset.id.toString(),
        asset_out: withdrawAsset.id.toString(),
        path_elements: pathElements.map((el) => toHex32(el)),
        path_indices: pathIndices,
        exchange_rate: withdrawRate.numerator.toString(),
        rate_denominator: withdrawRate.denominator.toString(),
        nullifier_hash: toHex32(nullifierBig),
        asset_out_public: withdrawAsset.id.toString(),
        merkle_root: toHex32(rootBigInt),
      };

      // Trigger Web Worker UltraHonk prover
      let proofResult;
      if (!config?.POOL_CONTRACT_ID) {
        // MOCK MODE: Simulate prover time and return dummy proof
        setWorkerStage('computing');
        await new Promise((r) => setTimeout(r, 1000));
        setWorkerStage('proving');
        await new Promise((r) => setTimeout(r, 4500));
        proofResult = { proof: new Uint8Array(14592), publicInputs: [] };
      } else {
        proofResult = await generateSwapProof(witnessInput, (stage) => {
          setWorkerStage(stage);
          setProvingSeconds(0);
        });
      }

      // -------------------------------------------------------------
      // Step 4: Verifying proof on-chain
      // -------------------------------------------------------------
      setWithdrawStep(4);
      setWorkerStage(null);

      // Slice prepended public inputs and format for verifier contract
      const { proofHex } = formatProofForContract(proofResult.proof, proofResult.publicInputs);

      // Submit verification transaction
      try {
        await submitVerifyWithdrawal(
          recipientAddress,
          proofHex,
          nullifierBig.toString(16).padStart(64, '0'),
          rootBigInt.toString(16).padStart(64, '0'),
          withdrawAsset.id,
          withdrawRate.numerator.toString(),
          withdrawRate.denominator.toString(),
          withdrawAmountBig.toString(),
          depositAsset.id,
          note.poolContractId
        );
      } catch (err: any) {
        console.error("Verification failed", err);
        throw new Error("Proof verification failed: " + (err.message || err));
      }

      // -------------------------------------------------------------
      // Step 5: Executing withdrawal
      // -------------------------------------------------------------
      setWithdrawStep(5);
      
      let result;
      try {
        result = await submitExecuteWithdrawal(
          recipientAddress,
          nullifierBig.toString(16).padStart(64, '0'),
          note.poolContractId
        );
      } catch (err: any) {
        console.error("Execution failed", err);
        setCanResumeNoteId(note.id);
        throw new Error("Execution failed. Verification completed, so you can resume withdrawal. " + (err.message || err));
      }

      // -------------------------------------------------------------
      // Step 6: Success & State updates
      // -------------------------------------------------------------
      setWithdrawStep(6);

      // Zero out active secret in local memory immediately
      activeSecret = null;

      // Update Note to zero out secret and mark status as withdrawn
      await updateNote(note.id, { secret: '0' });
      await markWithdrawn(note.id, result.txHash);

      // Log transaction history
      addTransaction({
        type: 'withdrawal',
        amount: (Number(withdrawAmountBig) / 10_000_000).toString(),
        asset: withdrawAssetOutCode,
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'private',
      });

      setWithdrawTxHash(result.txHash);
      setWithdrawStatus('success');
      setSelectedNoteId(null);
      setCanResumeNoteId(null);
      useToastStore.getState().addToast({ title: 'Success', message: `Withdrawal Successful! Tx Hash: ${result.txHash.slice(0, 12)}...`, severity: 'success' });
    } catch (error: unknown) {
      console.error('Withdraw flow failed:', error);
      const zError = handleError(error, 'transaction');
      setWithdrawStatus('idle');
      setWithdrawStep(0);
      useToastStore.getState().addToast({ title: 'Error', message: zError.message || 'Withdrawal failed.', severity: 'error' });
    } finally {
      // Safeguard: make sure memory references to secrets are wiped
      if (withdrawStatus === 'success') activeSecret = null;
    }
  };

  const handleResumeWithdraw = async () => {
    if (!selectedNoteId || !recipientAddress) return;
    try {
      setWithdrawStatus('loading');
      setWithdrawStep(5); // Start at execute step
      const note = notes.find((n) => n.id === selectedNoteId);
      if (!note) throw new Error('Note not found.');
      const depositAsset = getAssetByCode(note.asset);
      if (!depositAsset) throw new Error('Unknown asset.');
      
      // Need activeSecret to compute nullifier again.
      // Wait, we shouldn't wipe activeSecret if we fail in execution, but the prompt says:
      // "If Transaction 1 succeeds but Transaction 2 fails... Show a 'Resume withdrawal' button that just resubmits execute_withdrawal with the same nullifier."
      // Let's compute it.
      if (!note.secret) {
        throw new Error('Secret not found in local memory. Please re-enter it to continue.');
      }
      const activeSecret = BigInt(note.secret);
      const nullifierBig = computeNullifier(depositAsset.id.toString(), activeSecret);

      const result = await submitExecuteWithdrawal(
          recipientAddress,
          nullifierBig.toString(16).padStart(64, '0'),
          note.poolContractId
      );
      
      setWithdrawStep(6);
      await updateNote(note.id, { secret: '0' });
      await markWithdrawn(note.id, result.txHash);
      
      const withdrawAmountBig = BigInt(note.amount);
      
      addTransaction({
        type: 'withdrawal',
        amount: (Number(withdrawAmountBig) / 10_000_000).toString(),
        asset: withdrawAssetOutCode,
        txHash: result.txHash,
        timestamp: Date.now(),
        privacy: 'private',
      });
      setWithdrawTxHash(result.txHash);
      setWithdrawStatus('success');
      setSelectedNoteId(null);
      setCanResumeNoteId(null);
      useToastStore.getState().addToast({ title: 'Success', message: `Withdrawal Resumed & Successful! Tx Hash: ${result.txHash.slice(0, 12)}...`, severity: 'success' });
    } catch (error: any) {
      console.error('Resume flow failed:', error);
      const zError = handleError(error, 'transaction');
      setWithdrawStatus('idle');
      setWithdrawStep(0);
      useToastStore.getState().addToast({ title: 'Error', message: zError.message || 'Resume failed.', severity: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto font-sans">
      {/* Header and Subtext */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Application</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Private swap</h1>
          <p className="text-sm text-mutedText mt-1">Deposit one stablecoin, withdraw the other — unlinkable.</p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && (
            <div className="flex flex-col items-end gap-2">
              <Link
                href="/fund"
                className="px-3 py-1.5 border border-[#2775CA]/50 text-[#2775CA] hover:bg-[#2775CA]/10 font-bold rounded-[6px] text-[10px] uppercase tracking-wider transition duration-150 font-display bg-transparent"
              >
                Fund Testnet
              </Link>
            </div>
          )}
          <Link
            href="/swap/history"
            className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent text-center"
          >
            View History
          </Link>
        </div>
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
                    {isFetchingData && isConnected ? (
                      <ShimmerLoader className="w-24 h-4" borderRadius={4} />
                    ) : (
                      <>
                        <span>Balance {balances[assetInCode].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {isConnected && (
                          <button 
                            onClick={handleMaxClick}
                            className="text-[#B488DC] hover:text-[#D6C2EC] font-bold uppercase transition duration-150 font-display text-[11px]"
                          >
                            Max
                          </button>
                        )}
                      </>
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
                  <div className="relative" ref={dropdownInRef}>
                    <button
                      onClick={() => setIsDropdownInOpen(!isDropdownInOpen)}
                      className="flex items-center gap-2 bg-[#0B0B0C] border border-[#1D1D1F] hover:border-mutedText/50 px-3 py-1.5 rounded-[9px] text-white text-sm font-bold shadow transition duration-200 font-display"
                    >
                      {getAssetByCode(assetInCode) && (
                        <>
                          <div className={`w-5 h-5 rounded-full ${getAssetByCode(assetInCode)!.iconBgColor} flex items-center justify-center ${getAssetByCode(assetInCode)!.iconTextColor} text-[10px] font-bold font-sans`}>
                            {getAssetByCode(assetInCode)!.iconSymbol}
                          </div>
                          <span>{assetInCode}</span>
                        </>
                      )}
                      <svg className={`w-3.5 h-3.5 text-mutedText transition-transform duration-200 ${isDropdownInOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isDropdownInOpen && (
                      <div className="absolute right-0 mt-2 w-36 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display">
                        {ASSETS.filter(a => a.code !== assetOutCode).map((asset) => (
                          <button
                            key={asset.code}
                            onClick={() => {
                              setAssetInCode(asset.code);
                              setAmountIn('');
                              setIsDropdownInOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
                              assetInCode === asset.code
                                ? 'bg-[#1D1D1F] text-white'
                                : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full ${asset.iconBgColor} flex items-center justify-center ${asset.iconTextColor} text-[9px] font-bold font-sans`}>
                              {asset.iconSymbol}
                            </div>
                            {asset.code}
                          </button>
                        ))}
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
                  <div className="relative" ref={dropdownOutRef}>
                    <button
                      onClick={() => setIsDropdownOutOpen(!isDropdownOutOpen)}
                      className="flex items-center gap-2 bg-[#0B0B0C] border border-[#1D1D1F] hover:border-mutedText/50 px-3 py-1.5 rounded-[9px] text-white text-sm font-bold shadow transition duration-200 font-display"
                    >
                      {getAssetByCode(assetOutCode) && (
                        <>
                          <div className={`w-5 h-5 rounded-full ${getAssetByCode(assetOutCode)!.iconBgColor} flex items-center justify-center ${getAssetByCode(assetOutCode)!.iconTextColor} text-[10px] font-bold font-sans`}>
                            {getAssetByCode(assetOutCode)!.iconSymbol}
                          </div>
                          <span>{assetOutCode}</span>
                        </>
                      )}
                      <svg className={`w-3.5 h-3.5 text-mutedText transition-transform duration-200 ${isDropdownOutOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isDropdownOutOpen && (
                      <div className="absolute right-0 mt-2 w-36 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display">
                        {ASSETS.filter(a => a.code !== assetInCode).map((asset) => (
                          <button
                            key={asset.code}
                            onClick={() => {
                              setAssetOutCode(asset.code);
                              setIsDropdownOutOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-[9px] text-xs font-bold transition duration-150 ${
                              assetOutCode === asset.code
                                ? 'bg-[#1D1D1F] text-white'
                                : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full ${asset.iconBgColor} flex items-center justify-center ${asset.iconTextColor} text-[9px] font-bold font-sans`}>
                              {asset.iconSymbol}
                            </div>
                            {asset.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Rate row */}
            <div className="flex justify-between items-center text-xs text-mutedText mt-4 font-semibold px-1 font-mono">
              <span className="font-sans">Rate</span>
              <span className="text-white font-bold">
                {`1 ${assetInCode} = ${decimalRate.toFixed(4)} ${assetOutCode}`}
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
                    ? `Deposit ${amountIn} ${assetInCode}`
                    : depositValidation.message
                )}
              </button>
            </div>

            {/* Footer notice */}
            <p className="text-[10px] text-mutedText/60 text-center mt-4 leading-relaxed font-semibold max-w-sm mx-auto">
              The deposit is visible in this transaction. Privacy comes from the withdrawal being unlinkable to it.
            </p>
          </div>

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
                  {isFetchingData && isConnected ? (
                    <div className="flex flex-col gap-2">
                      <ShimmerLoader className="w-full h-[72px]" borderRadius={12} />
                      <ShimmerLoader className="w-full h-[72px]" borderRadius={12} />
                    </div>
                  ) : withdrawableNotes.length === 0 ? (
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
                        // Display logic just shows the note amount
                        const withAmount = depAmount;
                        const withAsset = note.asset;

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
                              <span className="text-sm font-bold text-white flex items-center gap-1.5 font-mono">
                                <span>{depAmount.toLocaleString('en-US', { maximumFractionDigits: 7 })} {note.asset}</span>
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

                {/* Withdrawal Asset Selector */}
                {selectedNoteId && (
                  <div className="flex flex-col gap-1.5 font-display">
                    <label className="text-xs font-bold text-mutedText uppercase tracking-wider">
                      Select Output Asset
                    </label>
                    <div className="relative" ref={withdrawDropdownRef}>
                      <button
                        onClick={() => setIsWithdrawDropdownOpen(!isWithdrawDropdownOpen)}
                        className="w-full flex items-center justify-between bg-[#000000] border border-[#1D1D1F] hover:border-[#5E2A8C] rounded-[12px] p-3 text-xs text-white transition duration-200"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full ${getAssetByCode(withdrawAssetOutCode)?.iconBgColor || ''} flex items-center justify-center ${getAssetByCode(withdrawAssetOutCode)?.iconTextColor || ''} text-[10px] font-bold font-sans`}>
                            {getAssetByCode(withdrawAssetOutCode)?.iconSymbol}
                          </div>
                          <span className="font-bold">{withdrawAssetOutCode}</span>
                        </div>
                        <svg className={`w-4 h-4 text-mutedText transition-transform duration-200 ${isWithdrawDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {isWithdrawDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-2 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[9px] shadow-xl z-50 p-1 font-display max-h-48 overflow-y-auto">
                          {ASSETS.filter((asset) => {
                            const note = notes.find(n => n.id === selectedNoteId);
                            const legacyPoolId = (config as any)?.LEGACY_POOL_CONTRACT_ID;
                            if (note && note.poolContractId === legacyPoolId) {
                              return asset.code === 'USDC' || asset.code === 'EURC';
                            }
                            return true;
                          }).map((asset) => (
                            <button
                              key={asset.code}
                              onClick={() => {
                                setWithdrawAssetOutCode(asset.code);
                                setIsWithdrawDropdownOpen(false);
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[9px] text-xs font-bold transition duration-150 ${
                                withdrawAssetOutCode === asset.code
                                  ? 'bg-[#1D1D1F] text-white'
                                  : 'text-mutedText hover:bg-[#1D1D1F]/50 hover:text-white'
                              }`}
                            >
                              <div className={`w-6 h-6 rounded-full ${asset.iconBgColor} flex items-center justify-center ${asset.iconTextColor} text-[11px] font-bold font-sans`}>
                                {asset.iconSymbol}
                              </div>
                              {asset.name} ({asset.code})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                <div className="mt-2 font-display flex gap-2">
                  <button
                    onClick={() => { setCanResumeNoteId(null); handleWithdraw(); }}
                    disabled={!selectedNoteId || !recipientAddress || withdrawStatus === 'loading'}
                    className={`w-full py-3.5 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 ${
                      !selectedNoteId || !recipientAddress
                        ? 'bg-[#1D1D1F] text-mutedText border border-[#333336] cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white active:scale-[0.99] shadow-[0_0_28px_rgba(123,55,168,0.3)] border-none'
                    }`}
                  >
                    Withdraw
                  </button>
                  {canResumeNoteId === selectedNoteId && (
                    <button
                      onClick={handleResumeWithdraw}
                      disabled={!recipientAddress || withdrawStatus === 'loading'}
                      className="w-full py-3.5 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 bg-[#1D1D1F] hover:bg-[#333336] text-white border border-[#333336]"
                    >
                      Resume
                    </button>
                  )}
                </div>

              </div>
            ) : (
              /* Execution Multi-step Progress Screen */
              <div className="flex flex-col gap-6 py-2">
                <div className="flex flex-col gap-4">
                  {[
                    { id: 1, label: "Fetching pool state..." },
                    { id: 2, label: "Building Merkle proof..." },
                    { id: 3, label: "Generating ZK proof..." },
                    { id: 4, label: "Verifying proof on-chain..." },
                    { id: 5, label: "Executing withdrawal..." },
                    { id: 6, label: "Swap complete!" }
                  ].map((step) => {
                    const isActive = withdrawStep === step.id && withdrawStatus === 'loading';
                    const isCompleted = withdrawStep > step.id || (step.id === 6 && withdrawStep === 6 && withdrawStatus === 'success');
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
              </div>
            )}

            <p className="text-[10px] text-mutedText/60 text-center mt-4 leading-relaxed font-semibold max-w-sm mx-auto">
              Zero-knowledge proof generation and validation are run locally in the browser before submitting to Soroban.
              <br /><br />
              <span className="text-amber-500/80">Note: The deposit asset type will be revealed when you withdraw. The amount stays private.</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
