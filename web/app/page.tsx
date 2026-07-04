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
import { ShimmerLoader } from '../components/ui/ShimmerLoader';
import { useToastStore } from '../store/useToast';
import { CheckCircle2, ChevronRight, Search, Zap, Clock, TrendingUp, TrendingDown, ArrowRightLeft, ShieldCheck, PieChart, Activity, Wallet, Lock, Plus, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Home() {
  const [filter, setFilter] = useState<'all' | 'swaps' | 'payroll'>('all');
  const [selectedTxHash, setSelectedTxHash] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const exchangeRate = useStore((state) => state.exchangeRate);
  const fetchPoolState = useStore((state) => state.fetchPoolState);
  const notes = useStore((state) => state.notes);
  const transactions = useStore((state) => state.transactions);
  const config = useStore((state) => state.config);
  const isConfigLoaded = useStore((state) => state.isConfigLoaded);

  const isConnected = status === 'connected';

  
  const [balances, setBalances] = useState({ USDC: 0, EURC: 0, MGUSD: 0, YLDS: 0, XLM: 0 });
  const [isLoading, setIsLoading] = useState(false);
  
  const showLoading = isLoading || !isConfigLoaded;

  
  useEffect(() => {
    if (isConnected && address) {
      setIsLoading(true);
      const loadDashboardData = async () => {
        try {
          await fetchPoolState();

          const balancePromises = [
            getTokenBalance(address, config?.USDC_SAC_ID || '').then(b => ({ code: 'USDC', bal: b })).catch(() => ({ code: 'USDC', bal: BigInt(0) })),
            getTokenBalance(address, config?.EURC_SAC_ID || '').then(b => ({ code: 'EURC', bal: b })).catch(() => ({ code: 'EURC', bal: BigInt(0) })),
            getTokenBalance(address, config?.MGUSD_SAC_ID || '').then(b => ({ code: 'MGUSD', bal: b })).catch(() => ({ code: 'MGUSD', bal: BigInt(0) })),
            getTokenBalance(address, config?.YLDS_SAC_ID || '').then(b => ({ code: 'YLDS', bal: b })).catch(() => ({ code: 'YLDS', bal: BigInt(0) })),
            getTokenBalance(address, config?.XLM_SAC_ID || '').then(b => ({ code: 'XLM', bal: b })).catch(() => ({ code: 'XLM', bal: BigInt(0) })),
          ];
          
          const results = await Promise.all(balancePromises);
          const newBalances: Record<string, number> = {};
          for (const res of results) {
            newBalances[res.code] = Number(res.bal) / 10_000_000;
          }
          setBalances(newBalances as any);
        } catch (e: unknown) {
          console.warn('Failed to load live data:', e);
          const zError = handleError(e, 'api', false);
          useToastStore.getState().addToast({ title: 'Warning', message: `Showing stale data. ${zError.message}`, severity: 'warning' });
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
  
  
  const shieldedPoolValue = useMemo(() => {
    return activeNotes.reduce((sum, note) => {
      const val = Number(note.amount) / 10_000_000;
      if (note.asset === 'EURC') return sum + val / decimalRate;
      if (note.asset === 'XLM') return sum + val * 0.08;
      return sum + val; 
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

  const chartData = useMemo(() => {
    if (!isConnected || sortedTransactions.length === 0) {
      return Array.from({ length: 10 }).map((_, i) => ({
        name: `Day ${i + 1}`,
        value: totalValue > 0 ? totalValue * (1 - (9 - i) * 0.01) : 0
      }));
    }
    const txsToUse = sortedTransactions.slice(0, 10);
    let currentPort = totalValue;
    const data = txsToUse.map((tx) => {
      const state = {
        name: new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: currentPort
      };
      const amt = parseFloat(tx.amount);
      const change = tx.asset === 'EURC' ? amt / decimalRate : amt;
      if (tx.type === 'withdrawal') currentPort += change;
      else currentPort -= change;
      return state;
    });
    // Add one more point for the start of the period
    data.push({
        name: 'Start',
        value: currentPort
    });
    return data.reverse();
  }, [isConnected, sortedTransactions, totalValue, decimalRate]);

  const percentChange = useMemo(() => {
    if (!isConnected || sortedTransactions.length === 0 || totalValue === 0) return 0;
    const txsToUse = sortedTransactions.slice(0, 10);
    let oldestPort = totalValue;
    txsToUse.forEach(tx => {
      const amt = parseFloat(tx.amount);
      const change = tx.asset === 'EURC' ? amt / decimalRate : amt;
      if (tx.type === 'withdrawal') oldestPort += change;
      else oldestPort -= change;
    });
    
    if (oldestPort <= 0) return 0;
    return ((totalValue - oldestPort) / oldestPort) * 100;
  }, [isConnected, sortedTransactions, totalValue, decimalRate]);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const containerVariants: any = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants: any = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col gap-8 max-w-6xl mx-auto pb-12"
    >
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white font-display mt-1">{`Dashboard`}</h1>
          <p className="text-sm text-mutedText mt-1">{today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <Link 
            href="/faucet" 
            className="px-3 py-1.5 border animate-border-pulse text-[#B488DC] hover:text-white hover:bg-[#5E2A8C]/20 font-bold rounded-[6px] text-[10px] uppercase tracking-wider transition-all duration-300 font-display bg-transparent"
          >
            Fund Testnet
          </Link>
          <Link href="/payroll" className="bg-transparent border border-white/10 hover:bg-white/5 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-all">
            Run payroll
          </Link>
          <Link href="/swap" className="px-5 py-2.5 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-sm transition-all shadow-[0_0_15px_rgba(123,55,168,0.3)] hover:shadow-[0_0_20px_rgba(123,55,168,0.5)] font-display tracking-wider">
            New swap
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        
        {}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="bg-[#53237E] border border-white/5 rounded-xl grid grid-cols-2 md:flex overflow-hidden shadow-2xl relative"
          style={{
            backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            backgroundPosition: 'center center'
          }}
        >
          <motion.div 
            variants={itemVariants} 
            className="col-span-2 md:col-span-1 p-6 md:p-8 md:flex-[1.5] border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent mix-blend-overlay" />
            <span className="text-[11px] font-bold text-white/80 uppercase tracking-widest block mb-4 relative z-10">PORTFOLIO VALUE</span>
            <div className="flex flex-col items-start gap-4 relative z-10">
              {showLoading ? (
                <ShimmerLoader className="w-[200px] h-[48px]" borderRadius={8} />
              ) : (
                <div className="flex items-baseline font-display">
                  <h2 className="text-[40px] text-white tracking-tight leading-none">
                    ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[0]}
                  </h2>
                  <span className="text-[20px] text-gray-400 ml-0.5">
                    .{totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[1]}
                  </span>
                </div>
              )}
              <span className={`inline-flex px-2.5 py-1 rounded-[6px] text-[11px] font-bold border relative z-10 ${
                percentChange >= 0 
                  ? 'bg-black/20 text-white/90 border-transparent shadow-sm' 
                  : 'bg-red-500/20 text-red-100 border-transparent shadow-sm'
              }`}>
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}% 30d
              </span>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 border-b md:border-b-0 border-r md:border-r border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">USDC</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.USDC.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div className="text-[13px] text-white/60">≈ ${balances.USDC.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            )}
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 border-b md:border-b-0 border-r md:border-r border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">EURC</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.EURC.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div className="text-[13px] text-white/60">≈ ${(balances.EURC / decimalRate).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            )}
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 border-b md:border-b-0 border-r md:border-r border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">MGUSD</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.MGUSD.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div className="text-[13px] text-white/60">≈ ${balances.MGUSD.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            )}
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 border-b md:border-b-0 border-r md:border-r border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">YLDS</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.YLDS.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div className="text-[13px] text-white/60">≈ ${balances.YLDS.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            )}
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 border-b md:border-b-0 border-r md:border-r border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">XLM</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{balances.XLM.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                <div className="text-[13px] text-white/60">≈ ${(balances.XLM * 0.08).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
              </div>
            )}
          </motion.div>
          <motion.div variants={itemVariants} className="p-6 md:p-8 md:flex-1 flex flex-col justify-between hover:bg-white/5 transition-colors duration-300">
            <span className="text-[11px] font-bold text-white/60 uppercase tracking-widest block mb-4 relative z-10">SHIELDED NOTES</span>
            {showLoading ? (
              <ShimmerLoader className="w-[80%] h-[40px]" borderRadius={8} />
            ) : (
              <div className="relative z-10">
                <div className="text-[26px] font-display text-white mb-1 leading-none">{activeNotes.length}</div>
                <div className="text-[13px] text-white/60">pending withdrawal</div>
              </div>
            )}
          </motion.div>
        </motion.div>

        {}
        <div className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">SHIELDED POOL</span>
              {showLoading ? (
                <ShimmerLoader className="w-[150px] h-[36px]" borderRadius={8} />
              ) : (
                <div className="text-[32px] font-display text-white leading-none">
                  ${shieldedPoolValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
            <div className="border border-white/10 bg-transparent text-gray-300 px-4 py-2 rounded-lg text-sm font-bold">
              {activeNotes.length} notes
            </div>
          </div>

          <div className="space-y-6 pt-2">
            {showLoading ? (
              <div className="space-y-4">
                <ShimmerLoader className="w-full h-[60px]" borderRadius={12} />
                <ShimmerLoader className="w-full h-[60px]" borderRadius={12} />
                <ShimmerLoader className="w-full h-[60px]" borderRadius={12} />
              </div>
            ) : poolBreakdown.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-4">No assets in shielded pool</div>
            ) : poolBreakdown.map((item) => {
              const def = getAssetByCode(item.asset);
              
              const hexColors: Record<string, string> = {
                USDC: '#FFFFFF',
                EURC: '#5E2A8C',
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

        <motion.div variants={itemVariants} className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8 shadow-xl hover:border-white/10 transition-colors duration-500">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-bold text-white">Portfolio</h3>
            <span className="text-[13px] font-mono text-gray-500">Last 30 Days</span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5E2A8C" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#5E2A8C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 11 }} 
                  dy={10} 
                  minTickGap={30}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141419', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                  labelStyle={{ color: '#6B7280', marginBottom: '4px' }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Value']}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#5E2A8C" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {}
        <motion.div variants={itemVariants} className="bg-[#141419] border border-white/5 rounded-xl p-6 md:p-8">
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
            {!showLoading && filteredTransactions.slice(0, 5).map((tx) => {
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
            
            {showLoading ? (
              <div className="space-y-4">
                <ShimmerLoader className="w-full h-[80px]" borderRadius={12} />
                <ShimmerLoader className="w-full h-[80px]" borderRadius={12} />
                <ShimmerLoader className="w-full h-[80px]" borderRadius={12} />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-8">No transactions</div>
            ) : null}
          </div>
        </motion.div>
      </div>

      <TransactionDetailModal
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedTxHash(null); }}
        transaction={transactions.find(t => t.txHash === selectedTxHash) || null}
        notes={notes}
        exchangeRate={{ numerator: rateNum, denominator: rateDen }}
      />
    </motion.div>
  );
}
