'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui/Badge';
import { TransactionDetailModal } from '../components/ui/TransactionDetailModal';
import { getTokenBalance } from '../lib/contracts';
import { formatCurrency } from '../lib/utils';
import { getAssetByCode } from '../lib/assets';
import { ZendSwapError, handleError } from '../lib/errors';
import { ErrorDisplay } from '../components/ui/ErrorDisplay';

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
  const config = useStore((state) => state.config);

  const isConnected = status === 'connected';

  // Balances state
  const [balances, setBalances] = useState({ USDC: 0, EURC: 0, MGUSD: 0, YLDS: 0, XLM: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<ZendSwapError | null>(null);

  // Fetch balances and pool state on connection
  useEffect(() => {
    if (isConnected && address) {
      setIsLoading(true);
      const loadDashboardData = async () => {
        try {
          await fetchPoolState();

          const usdcBal = await getTokenBalance(address, config?.USDC_SAC_ID || '');
          const eurcBal = await getTokenBalance(address, config?.EURC_SAC_ID || '');
          const mgusdBal = await getTokenBalance(address, config?.MGUSD_SAC_ID || '');
          const yldsBal = await getTokenBalance(address, config?.YLDS_SAC_ID || '');
          const xlmBal = await getTokenBalance(address, config?.XLM_SAC_ID || '');
          
          setBalances({
            USDC: Number(usdcBal) / 10_000_000,
            EURC: Number(eurcBal) / 10_000_000,
            MGUSD: Number(mgusdBal) / 10_000_000,
            YLDS: Number(yldsBal) / 10_000_000,
            XLM: Number(xlmBal) / 10_000_000,
          });
          setFetchError(null);
        } catch (e: unknown) {
          console.warn('Failed to load live data:', e);
          const zError = handleError(e, 'api', false); // don't toast, we show banner
          setFetchError(zError);
        } finally {
          setIsLoading(false);
        }
      };

      loadDashboardData();
      const interval = setInterval(loadDashboardData, 30000);
      return () => clearInterval(interval);
    } else {
      setIsLoading(false);
      setBalances({ USDC: 0, EURC: 0, MGUSD: 0, YLDS: 0, XLM: 0 });
    }
  }, [isConnected, address, fetchPoolState, config]);

  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  const eurcUsdVal = balances.EURC / decimalRate;
  const xlmUsdVal = balances.XLM * 0.08;
  const totalValue = balances.USDC + eurcUsdVal + balances.MGUSD + balances.YLDS + xlmUsdVal;

  const activeNotes = useMemo(() => notes.filter((n) => n.status === 'deposited'), [notes]);
  
  // Calculate shielded pool totals
  const shieldedPoolValue = useMemo(() => {
    return activeNotes.reduce((sum, note) => {
      const val = Number(note.amount) / 10_000_000;
      if (note.asset === 'EURC') return sum + val / decimalRate;
      if (note.asset === 'XLM') return sum + val * 0.08;
      return sum + val; // treating MGUSD, USDC, YLDS as 1:1 for display pool value
    }, 0);
  }, [activeNotes, decimalRate]);

  const poolBreakdown = useMemo(() => {
    const assets: Record<string, { total: number, count: number }> = {};
    activeNotes.forEach(note => {
      const val = Number(note.amount) / 10_000_000;
      if (!assets[note.asset]) assets[note.asset] = { total: 0, count: 0 };
      assets[note.asset].total += val;
      assets[note.asset].count += 1;
    });
    return Object.entries(assets).map(([asset, data]) => {
      const valInUsd = asset === 'EURC' ? data.total / decimalRate : data.total;
      const pct = shieldedPoolValue > 0 ? (valInUsd / shieldedPoolValue) * 100 : 0;
      return { asset, total: data.total, count: data.count, pct };
    }).sort((a, b) => b.pct - a.pct);
  }, [activeNotes, shieldedPoolValue, decimalRate]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return sortedTransactions.filter((tx) => {
      if (filter === 'all') return true;
      if (filter === 'swaps') return tx.type === 'withdrawal' || tx.type === 'deposit';
      if (filter === 'payroll') return tx.privacy === 'private' && tx.type !== 'deposit' && tx.type !== 'withdrawal';
      return true;
    });
  }, [sortedTransactions, filter]);

  // Chart Points
  const chartPoints = useMemo(() => {
    if (!isConnected || sortedTransactions.length === 0) {
      return totalValue > 0 ? `M 0,100 C 200,90 400,60 600,40` : 'M 0,100 L 600,100';
    }
    const txsToUse = sortedTransactions.slice(0, 10);
    let currentPort = totalValue;
    const checkpoints = txsToUse.map((tx, idx) => {
      const x = 600 - (idx / (Math.max(txsToUse.length - 1, 1))) * 600;
      const state = { x, val: currentPort };
      const amt = parseFloat(tx.amount);
      const change = tx.asset === 'EURC' ? amt / decimalRate : amt;
      if (tx.type === 'withdrawal') currentPort += change;
      else currentPort -= change;
      return state;
    });
    checkpoints.reverse();
    const minVal = Math.min(...checkpoints.map((c) => c.val)) * 0.9;
    const maxVal = Math.max(...checkpoints.map((c) => c.val)) * 1.1;
    const range = maxVal - minVal || 1;
    const pointsStr = checkpoints.map((c) => `${c.x},${100 - ((c.val - minVal) / range) * 80}`).join(' L ');
    return `M 0,100 L ${pointsStr}`;
  }, [isConnected, sortedTransactions, totalValue, decimalRate]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto animate-fade-in pb-12">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-display mt-1">{`Dashboard`}</h1>
          <p className="text-sm text-mutedText mt-1">{today}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/faucet" 
            className="px-3 py-1.5 border border-[#2775CA]/50 text-[#2775CA] hover:bg-[#2775CA]/10 font-bold rounded-[6px] text-[10px] uppercase tracking-wider transition duration-150 font-display bg-transparent"
          >
            Fund Testnet
          </Link>
          <Link href="/payroll" className="bg-transparent border border-white/10 hover:bg-white/5 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all">
            Run payroll
          </Link>
          <Link href="/swap" className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)]">
            New swap
          </Link>
        </div>
      </div>

      {fetchError && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs font-semibold text-amber-400">
              <span className="text-white">Warning: Showing stale data.</span> {fetchError.message}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        
        {/* Row 1: Portfolio Value & Balances */}
        <div className="bg-[#141419] border border-white/5 rounded-xl flex flex-col md:flex-row overflow-hidden">
          <div className="p-6 md:p-8 flex-[1.5] border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">PORTFOLIO VALUE</span>
            <div className="flex flex-col items-start gap-4">
              <div className="flex items-baseline font-display">
                <h2 className="text-[40px] text-white tracking-tight leading-none">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[0]}
                </h2>
                <span className="text-[20px] text-gray-400 ml-0.5">
                  .{totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[1]}
                </span>
              </div>
              <span className="inline-flex bg-[#3B1C5F]/40 text-[#A874F5] px-2.5 py-1 rounded-[6px] text-[11px] font-bold border border-[#A874F5]/10">
                +12.4% 30d
              </span>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">USDC</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.USDC.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
              <div className="text-[13px] text-gray-500">≈ ${balances.USDC.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">EURC</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.EURC.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
              <div className="text-[13px] text-gray-500">≈ ${(balances.EURC / decimalRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">MGUSD</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.MGUSD.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
              <div className="text-[13px] text-gray-500">≈ ${balances.MGUSD.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">YLDS</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.YLDS.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
              <div className="text-[13px] text-gray-500">≈ ${balances.YLDS.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">XLM</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.XLM.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
              <div className="text-[13px] text-gray-500">≈ ${(balances.XLM * 0.08).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          </div>
          <div className="p-6 md:p-8 flex-1 flex flex-col justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">SHIELDED NOTES</span>
            <div>
              <div className="text-[26px] font-display text-white mb-1 leading-none">{activeNotes.length}</div>
              <div className="text-[13px] text-gray-500">pending withdrawal</div>
            </div>
          </div>
        </div>

        {/* Row 2: Shielded Pool */}
        <div className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">SHIELDED POOL</span>
              <div className="text-[32px] font-display text-white leading-none">
                ${shieldedPoolValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="border border-white/10 bg-transparent text-gray-300 px-4 py-2 rounded-lg text-sm font-bold">
              {activeNotes.length} notes
            </div>
          </div>

          <div className="space-y-6 pt-2">
            {poolBreakdown.length === 0 && (
              <div className="text-center text-sm text-gray-500 py-4">No assets in shielded pool</div>
            )}
            {poolBreakdown.map((item) => {
              const def = getAssetByCode(item.asset);
              
              const hexColors: Record<string, string> = {
                USDC: '#FFFFFF',
                EURC: '#7C3AED',
                MGUSD: '#A874F5',
                YLDS: '#06B6D4',
                XLM: '#10B981'
              };
              
              const color = hexColors[item.asset] || '#6B7280';
              
              return (
                <div key={item.asset} className="flex items-center gap-6">
                  <div className="flex-shrink-0 w-[3px] h-10 rounded-full" style={{ backgroundColor: color }} />
                  <div className="w-32 flex-shrink-0">
                    <div className="text-white font-bold text-[15px]">{item.asset}</div>
                    <div className="text-[13px] text-gray-500 mt-0.5">{def?.name}</div>
                  </div>
                  <div className="flex-1 flex items-center pr-4">
                    <div className="w-full bg-white/5 rounded-full h-[3px] overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: color, width: `${Math.max(item.pct, 1)}%` }}></div>
                    </div>
                  </div>
                  <div className="w-28 text-right flex-shrink-0">
                    <div className="text-white font-display text-[15px]">{formatCurrency(item.total, item.asset)}</div>
                    <div className="text-[13px] text-gray-500 mt-0.5">{item.count} note{item.count !== 1 && 's'} &middot; {Math.round(item.pct)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Row 3: Portfolio Chart */}
        <div className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[15px] font-bold text-white">Portfolio</h3>
            <span className="text-[13px] font-mono text-gray-500">Mar - Jun 2025</span>
          </div>
          <div className="h-[180px] w-full relative">
            <svg viewBox="0 0 600 120" className="w-full h-full preserve-3d" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={`${chartPoints} L 600,120 L 0,120 Z`} fill="url(#chartGrad)" />
              <path d={chartPoints} fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="600" cy="30" r="3" fill="#7C3AED" />
            </svg>
            <div className="absolute bottom-0 left-0 w-full flex justify-between text-[11px] font-mono text-gray-500 px-2 pb-[-8px]">
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
              <span>Jun</span>
            </div>
          </div>
        </div>

        {/* Row 4: Transactions */}
        <div className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[15px] font-bold text-white">Transactions</h3>
            <div className="flex items-center gap-2">
              {(['all', 'swaps', 'payroll'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-bold capitalize transition-colors ${
                    filter === t 
                      ? 'bg-transparent text-white border border-white/10' 
                      : 'bg-transparent border border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-1">
            {filteredTransactions.slice(0, 5).map((tx) => {
              const isDeposit = tx.type === 'deposit';
              const isPrivate = tx.privacy === 'private';
              
              let iconColor = isDeposit ? 'text-[#3B82F6] bg-[#1E3A8A]/20' : 'text-[#A874F5] bg-[#3B1C5F]/20';
              let title = isDeposit ? 'Deposit to pool' : tx.type === 'withdrawal' ? `Swap ${tx.asset}` : 'June payroll';
              if (tx.type === 'withdrawal' && isPrivate) {
                title = `Swap USDC → EURC`;
              }
              
              return (
                <div key={tx.txHash} 
                     onClick={() => { setSelectedTxHash(tx.txHash); setIsDetailOpen(true); }}
                     className="flex items-center justify-between group cursor-pointer p-4 -mx-4 rounded-xl hover:bg-white/5 transition-colors border-b border-transparent hover:border-white/5"
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconColor}`}>
                      {isDeposit ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      ) : tx.type === 'withdrawal' ? (
                        <svg className="w-4 h-4 transform rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-[15px] font-bold text-white mb-0.5 group-hover:text-[#A874F5] transition-colors">
                        {title}
                      </div>
                      <div className="text-[13px] text-gray-500">
                        {isDeposit ? `${tx.asset} commitment` : isPrivate ? 'shielded' : '4 recipients · private'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-10">
                    <div className={`text-[10px] font-bold px-2 py-1 rounded-[4px] uppercase tracking-widest ${
                      isPrivate ? 'bg-[#3B1C5F]/30 text-[#A874F5] border border-[#A874F5]/10' : 'bg-transparent text-gray-500 border border-white/10'
                    }`}>
                      {tx.privacy}
                    </div>
                    <div className="text-right min-w-[120px]">
                      <div className="text-[15px] font-bold text-white mb-0.5">
                        {isDeposit ? 
                          formatCurrency(tx.amount, tx.asset) : 
                          isPrivate && tx.type === 'withdrawal' ? `${tx.amount} ` : 
                          formatCurrency(tx.amount, tx.asset)
                        }
                        {isPrivate && tx.type === 'withdrawal' && <span className="text-[#A874F5]">{tx.asset}</span>}
                      </div>
                      <div className="text-[13px] text-gray-500">
                        {new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {filteredTransactions.length === 0 && (
              <div className="text-center text-sm text-gray-500 py-8">No transactions</div>
            )}
          </div>
        </div>
      </div>

      <TransactionDetailModal
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedTxHash(null); }}
        transaction={transactions.find(t => t.txHash === selectedTxHash) || null}
        notes={notes}
        exchangeRate={{ numerator: rateNum, denominator: rateDen }}
      />
    </div>
  );
}
