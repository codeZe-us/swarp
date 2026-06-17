'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  const handleConnect = () => {
    setIsWalletConnected(true);
    setIsBannerVisible(false);
  };

  const navItems = [
    { 
      name: 'Home', 
      href: '/', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    { 
      name: 'Swap', 
      href: '/swap', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      )
    },
    { 
      name: 'Payroll', 
      href: '/payroll', 
      soon: true, 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      name: 'Team', 
      href: '/team', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    },
    { 
      name: 'KYC', 
      href: '/kyc', 
      soon: true, 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-darkBackground text-white">
      {/* Top Banner */}
      {isBannerVisible && !isWalletConnected && (
        <div className="flex items-center justify-between px-6 py-3 bg-primaryAccent text-white text-sm font-medium z-50 shadow-md">
          <div className="flex items-center gap-2">
            <span>Connect a Stellar wallet to deposit, pay and prove.</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleConnect}
              className="px-4 py-1 bg-white text-primaryAccent hover:bg-slate-100 rounded-md font-semibold text-xs transition duration-200"
            >
              Connect
            </button>
            <button 
              onClick={() => setIsBannerVisible(false)}
              className="text-white hover:text-slate-200 transition duration-150"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-darkBackground border-r border-borderSubtle flex flex-col justify-between p-6">
          <div className="flex flex-col gap-8">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primaryAccent to-purple-400 flex items-center justify-center shadow-lg shadow-purple-900/20">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-bold text-xl tracking-tight text-white">Swarp</span>
            </div>

            {/* Menu */}
            <nav className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-mutedText/60 tracking-wider uppercase mb-2">Menu</span>
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition duration-200 group ${
                      active 
                        ? 'bg-primaryAccent/10 text-white border border-primaryAccent/20' 
                        : 'text-mutedText hover:bg-cardSurface hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon(active)}
                      <span>{item.name}</span>
                    </div>
                    {item.soon && (
                      <span className="text-[9px] bg-borderSubtle text-mutedText group-hover:text-white px-1.5 py-0.5 rounded font-bold tracking-wider">
                        SOON
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Connection Status Profile Card */}
          <div className="bg-cardSurface border border-borderSubtle rounded-xl p-4 flex flex-col gap-2 mt-auto">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isWalletConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></div>
              <span className="text-xs font-semibold text-white">
                {isWalletConnected ? 'GDQP...7K4XM' : 'No wallet connected'}
              </span>
            </div>
            <span className="text-[10px] text-mutedText">
              Stellar testnet - {isWalletConnected ? 'connected' : 'disconnected'}
            </span>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-darkBackground p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
