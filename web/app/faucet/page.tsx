'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getTokenBalance } from '../../lib/contracts';
import { formatCurrency } from '../../lib/utils';
import { addTrustline } from '../../lib/stellar';

export default function FaucetPage() {
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const config = useStore((state) => state.config);

  const [activeAsset, setActiveAsset] = useState<'USDC' | 'EURC' | 'MGUSD' | 'YLDS'>('USDC');
  const [mintAmount, setMintAmount] = useState<string>('100');
  
  const [isMinting, setIsMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);

  const [isFundingXlm, setIsFundingXlm] = useState(false);
  const [xlmSuccess, setXlmSuccess] = useState<string | null>(null);
  const [xlmError, setXlmError] = useState<string | null>(null);

  const [balances, setBalances] = useState<Record<string, string>>({
    USDC: '0.00', EURC: '0.00', MGUSD: '0.00', YLDS: '0.00', XLM: '0.00'
  });

  const fetchBalances = async () => {
    if (status !== 'connected' || !address || !config) return;
    try {
      const usdc = await getTokenBalance(address, config.USDC_SAC_ID);
      const eurc = await getTokenBalance(address, config.EURC_SAC_ID);
      const mgusd = await getTokenBalance(address, config.MGUSD_SAC_ID);
      const ylds = await getTokenBalance(address, config.YLDS_SAC_ID);
      const xlm = await getTokenBalance(address, config.XLM_SAC_ID);
      
      setBalances({
        USDC: (Number(usdc) / 10_000_000).toFixed(2),
        EURC: (Number(eurc) / 10_000_000).toFixed(2),
        MGUSD: (Number(mgusd) / 10_000_000).toFixed(2),
        YLDS: (Number(ylds) / 10_000_000).toFixed(2),
        XLM: (Number(xlm) / 10_000_000).toFixed(2)
      });
    } catch (err) {
      console.warn("Failed to fetch balances", err);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [status, address, config]);

  const handleMintAsset = async () => {
    if (!address || !config) {
      setMintError('Please connect your wallet first.');
      return;
    }
    if (!mintAmount || parseFloat(mintAmount) <= 0) {
      setMintError('Please enter a valid amount.');
      return;
    }

    setIsMinting(true);
    setMintError(null);
    setMintSuccess(null);

    const performMint = async () => {
      const res = await fetch('/api/faucet/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientAddress: address, assetCode: activeAsset, amount: mintAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to mint ${activeAsset}`);
      }
      return data;
    };

    try {
      const data = await performMint();
      setMintSuccess(`Successfully minted ${mintAmount} ${activeAsset}! Tx: ${data.txHash.slice(0, 10)}...`);
      await fetchBalances();
    } catch (err: any) {
      if (err.message?.includes('op_no_trust')) {
        try {
          setMintError(`Trustline required for ${activeAsset}. Please approve the transaction in your wallet...`);
          const issuerKey = `${activeAsset}_ISSUER_ADDRESS` as keyof typeof config;
          const issuerAddress = config[issuerKey];
          if (!issuerAddress) throw new Error(`Issuer address not configured for ${activeAsset}`);
          
          await addTrustline(activeAsset, issuerAddress as string);
          
          setMintError(`Trustline added! Retrying mint...`);
          const data = await performMint();
          setMintSuccess(`Successfully minted ${mintAmount} ${activeAsset}! Tx: ${data.txHash.slice(0, 10)}...`);
          setMintError(null);
          await fetchBalances();
        } catch (trustErr: any) {
          setMintError(trustErr.message === 'The user closed the modal.' ? 'Trustline creation was rejected.' : `Failed to add trustline: ${trustErr.message}`);
        }
      } else {
        setMintError(err.message || `Failed to mint ${activeAsset}`);
      }
    } finally {
      setIsMinting(false);
    }
  };

  const handleFundXlm = async () => {
    if (!address) {
      setXlmError('Please connect your wallet first.');
      return;
    }

    setIsFundingXlm(true);
    setXlmError(null);
    setXlmSuccess(null);

    try {
      const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
      if (!res.ok) {
        throw new Error('Friendbot funding failed or account is already funded.');
      }
      setXlmSuccess(`Successfully funded 10,000 testnet XLM via Friendbot!`);
      await fetchBalances();
    } catch (err: any) {
      setXlmError(err.message || 'Failed to fund XLM.');
    } finally {
      setIsFundingXlm(false);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto pt-8 pb-12 animate-fade-in px-4">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-white mb-2">Faucet</h1>
        <p className="text-gray-400 text-sm">Mint mock testnet assets to your wallet.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        
        {/* Main Column */}
        <div className="space-y-6">
          
          {/* XLM Section */}
          <div className="bg-[#141419] border border-white/5 rounded-xl p-6 flex items-center justify-between">
            <div>
              <h2 className="text-white font-bold text-lg mb-1">XLM for fees</h2>
              <div className="flex items-center text-sm">
                <span className="text-gray-500 mr-1">Friendbot</span>
                <span className="text-gray-500">·</span>
                <span className="text-gray-400 font-mono ml-1">{balances.XLM} XLM</span>
              </div>
              {xlmSuccess && <p className="text-emerald-400 text-xs mt-2">{xlmSuccess}</p>}
              {xlmError && <p className="text-red-400 text-xs mt-2">{xlmError}</p>}
            </div>
            <button 
              onClick={handleFundXlm}
              disabled={isFundingXlm || status !== 'connected'}
              className="bg-transparent border border-white/10 hover:bg-white/5 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFundingXlm ? 'Funding...' : 'Fund XLM'}
            </button>
          </div>

          {/* Minting Form */}
          <div className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">SELECT TOKEN</span>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              {(['USDC', 'EURC', 'MGUSD', 'YLDS'] as const).map((asset) => {
                const details: Record<string, { name: string }> = {
                  USDC: { name: 'Stablecoin' },
                  EURC: { name: 'Euro Coin' },
                  MGUSD: { name: 'Multi-asset' },
                  YLDS: { name: 'Yield' }
                };
                return (
                  <button
                    key={asset}
                    onClick={() => setActiveAsset(asset)}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                      activeAsset === asset 
                        ? 'border-[#7C3AED]/50 bg-[#3B1C5F]/20' 
                        : 'border-white/5 bg-transparent hover:bg-white/5'
                    }`}
                  >
                    <span className="text-[12px] text-gray-500 mb-1">{details[asset].name}</span>
                    <span className="text-[18px] font-bold text-white mb-1 leading-none">{asset}</span>
                    <span className="text-[12px] text-gray-500">{balances[asset] || '0.00'}</span>
                  </button>
                );
              })}
            </div>

            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">AMOUNT</span>
            <div className="relative mb-6">
              <input 
                type="number" 
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                className="w-full bg-[#0A0A0C] border border-white/10 rounded-xl px-5 py-4 text-2xl font-bold text-white focus:outline-none focus:border-[#7C3AED] transition-colors"
                placeholder="0"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <span className="bg-[#2A2A35] text-gray-300 text-[12px] font-bold px-3 py-1.5 rounded-md">
                  {activeAsset}
                </span>
              </div>
            </div>

            <button 
              onClick={handleMintAsset}
              disabled={isMinting || status !== 'connected'}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white py-4 rounded-xl text-[15px] font-bold transition-all shadow-[0_0_15px_rgba(124,58,237,0.3)] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              {isMinting ? 'Minting...' : `Mint ${activeAsset}`}
            </button>

            {mintSuccess && (
              <div className="flex items-center gap-2 text-[#34D399] bg-[#064E3B]/30 border border-[#059669]/30 rounded-lg p-4 text-[13px]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {mintSuccess}
              </div>
            )}
            {mintError && (
              <div className="flex items-center gap-2 text-[#F87171] bg-[#7F1D1D]/30 border border-[#DC2626]/30 rounded-lg p-4 text-[13px]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {mintError}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          
          <div className="bg-[#141419] border border-white/5 rounded-xl p-6">
            <h3 className="text-[15px] font-bold text-white mb-6">Network</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">Chain</span>
                <span className="text-white font-bold">Stellar</span>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">Mode</span>
                <span className="text-[#F59E0B] font-bold">Testnet</span>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">RPC</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#10B981]"></div>
                  <span className="text-[#10B981] font-bold">Online</span>
                </div>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between text-[13px]">
                <span className="text-gray-500">VM</span>
                <span className="text-[#A874F5] font-bold">Soroban</span>
              </div>
            </div>
          </div>

          <div className="bg-[#141419] border border-white/5 rounded-xl p-6">
            <h3 className="text-[15px] font-bold text-white mb-6">Mint limits</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-white font-bold">USDC</span>
                <span className="text-gray-500 font-mono">10,000 / mint</span>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-white font-bold">EURC</span>
                <span className="text-gray-500 font-mono">10,000 / mint</span>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-white font-bold">MGUSD</span>
                <span className="text-gray-500 font-mono">50,000 / mint</span>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-white font-bold">YLDS</span>
                <span className="text-gray-500 font-mono">50,000 / mint</span>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-gray-500 leading-relaxed px-2">
            Mock assets only. No real value. Tokens exist on Stellar testnet and are reset periodically.
          </p>
        </div>
      </div>
    </div>
  );
}
