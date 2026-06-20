'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [filter, setFilter] = useState<'all' | 'swaps' | 'payroll'>('all');

  const transactions = [
    {
      id: 1,
      type: 'payroll',
      title: 'June payroll',
      subtitle: '4 recipients · private',
      badge: 'PRIVATE',
      amount: '$15,070',
      date: 'Jun 14',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      id: 2,
      type: 'swap',
      title: 'Swap USDC → EURC',
      subtitle: 'shielded',
      badge: 'PRIVATE',
      amount: '460.00 EURC',
      date: 'Jun 10',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    {
      id: 3,
      type: 'swap',
      title: 'Swap EURC → USDC',
      subtitle: 'shielded',
      badge: 'PRIVATE',
      amount: '1,086.96 USDC',
      date: 'Jun 6',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    {
      id: 4,
      type: 'deposit',
      title: 'Deposit to pool',
      subtitle: 'USDC commitment',
      badge: 'PUBLIC',
      amount: '500.00 USDC',
      date: 'Jun 9',
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
        </svg>
      )
    },
    {
      id: 5,
      type: 'payroll',
      title: 'May payroll',
      subtitle: '4 recipients · private',
      badge: 'PRIVATE',
      amount: '$14,200',
      date: 'May 31',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      id: 6,
      type: 'swap',
      title: 'Swap USDC → EURC',
      subtitle: 'shielded',
      badge: 'PRIVATE',
      amount: '230.00 EURC',
      date: 'Jun 4',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    }
  ];

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'swaps') return t.type === 'swap' || t.type === 'deposit';
    if (filter === 'payroll') return t.type === 'payroll';
    return true;
  });

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Dashboard</span>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1">Welcome back</h1>
          <p className="text-sm text-mutedText mt-1">Here&apos;s what&apos;s moving across your shielded accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/payroll" className="px-4 py-2 border border-borderSubtle hover:border-mutedText rounded-lg text-sm font-semibold transition duration-200 bg-[#000000] text-white">
            Run payroll
          </Link>
          <Link href="/swap" className="px-4 py-2 bg-primaryAccent hover:bg-primaryHover rounded-lg text-sm font-semibold transition duration-200 text-white shadow-md shadow-purple-900/10">
            New swap
          </Link>
        </div>
      </div>

      {/* Grid Layout: Main Charts & Balances */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Value Card (2/3 width) */}
        <div className="lg:col-span-2 bg-cardSurface border border-borderSubtle rounded-2xl p-6 flex flex-col justify-between h-[320px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText">Portfolio value</span>
              <div className="flex items-center gap-1 bg-primaryAccent/10 border border-primaryAccent/20 px-2 py-0.5 rounded-full text-xs font-semibold text-purple-400">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <span>12.4%</span>
              </div>
            </div>
            <h2 className="text-4xl font-extrabold text-white mt-2">
              $29,137<span className="text-2xl text-mutedText/70">.40</span>
            </h2>
          </div>

          {/* SVG Line Chart */}
          <div className="h-32 w-full mt-4 relative">
            <svg viewBox="0 0 600 120" className="w-full h-full">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Gradient area */}
              <path 
                d="M 0,110 Q 75,90 150,85 T 300,75 T 450,55 T 600,20 L 600,120 L 0,120 Z" 
                fill="url(#chartGradient)" 
              />
              {/* Line */}
              <path 
                d="M 0,110 Q 75,90 150,85 T 300,75 T 450,55 T 600,20" 
                fill="none" 
                stroke="#7C3AED" 
                strokeWidth="3.5" 
                strokeLinecap="round"
              />
              {/* Points */}
              <circle cx="600" cy="20" r="4" fill="#ffffff" stroke="#7C3AED" strokeWidth="2" />
            </svg>
            <div className="flex justify-between items-center text-[10px] font-bold text-mutedText/50 px-1 mt-2">
              <span>Mar</span>
              <span>Apr</span>
              <span>May</span>
              <span>Jun</span>
            </div>
          </div>
        </div>

        {/* Side Balance Cards */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* USDC Balance */}
          <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-6 flex flex-col justify-between h-[148px]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText">USDC balance</span>
              <div className="w-8 h-8 rounded-full bg-[#2775CA]/10 flex items-center justify-center border border-[#2775CA]/20">
                <svg className="w-4 h-4 text-[#2775CA]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.25 14.25v1.5h-2.5v-1.5c-2-.3-3.25-1.5-3.25-3.25h1.75c0 .85.75 1.5 1.5 1.5s1.5-.65 1.5-1.5c0-.85-.5-1.25-1.75-1.75-1.75-.7-3-.15-3-3.25s1.25-2.85 3.25-3.15v-1.65h2.5v1.65c1.8.35 2.75 1.45 2.75 3.1h-1.75c0-.95-.8-1.45-1.5-1.45s-1.5.5-1.5 1.35c0 .75.45 1.15 1.75 1.6 1.7.6 3 1.25 3 3.25 0 2.05-1.35 2.85-3.25 3.15z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-white">18,420.00</h3>
              <p className="text-xs text-mutedText mt-1">≈ $18,420.00</p>
            </div>
          </div>

          {/* EURC Balance */}
          <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-6 flex flex-col justify-between h-[148px]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-mutedText">EURC balance</span>
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <span className="text-purple-400 font-bold text-xs">€</span>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-white">9,860.00</h3>
              <p className="text-xs text-mutedText mt-1">≈ $10,717.39</p>
            </div>
          </div>
        </div>
      </div>

      {/* Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText">Swapped this month</span>
          <span className="text-xl font-bold text-white">$4,180</span>
        </div>
        <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText">Payroll paid (30d)</span>
          <span className="text-xl font-bold text-white">$15,070</span>
        </div>
        <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-5 flex flex-col gap-1.5">
          <span className="text-xs text-mutedText">Active notes</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xl font-bold text-white">1</span>
            <span className="text-[10px] bg-primaryAccent/10 text-purple-400 border border-primaryAccent/20 px-1.5 py-0.5 rounded font-medium">
              shielded
            </span>
          </div>
        </div>
      </div>

      {/* Transactions Table Section */}
      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Transactions</h2>
          <div className="flex items-center gap-1.5 bg-[#000000] border border-borderSubtle p-1 rounded-lg">
            {(['all', 'swaps', 'payroll'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition duration-150 ${
                  filter === t
                    ? 'bg-primaryAccent text-white shadow shadow-purple-950/20'
                    : 'text-mutedText hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex flex-col divide-y divide-borderSubtle">
          {filteredTransactions.map((tx) => (
            <div key={tx.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0 group hover:bg-slate-900/10 px-2 rounded-lg transition duration-150">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-darkBackground border border-borderSubtle flex items-center justify-center">
                  {tx.icon}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-primaryAccent transition duration-150">{tx.title}</h4>
                  <p className="text-xs text-mutedText mt-0.5">{tx.subtitle}</p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${
                  tx.badge === 'PRIVATE' 
                    ? 'bg-purple-950/40 text-purple-400 border border-purple-900/30' 
                    : 'bg-slate-900/60 text-slate-400 border border-borderSubtle'
                }`}>
                  {tx.badge}
                </span>
                <div className="text-right min-w-[100px]">
                  <span className="text-sm font-bold text-white block">{tx.amount}</span>
                  <span className="text-[10px] text-mutedText block mt-0.5">{tx.date}</span>
                </div>
              </div>
            </div>
          ))}
          {filteredTransactions.length === 0 && (
            <div className="py-8 text-center text-sm text-mutedText">
              No transactions match this filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
