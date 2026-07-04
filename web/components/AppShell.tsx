'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useWallet } from '../hooks/useWallet';
import { useStore } from '../store/useStore';
import { WalletConnect } from './WalletConnect';
import { TruncatedAddress } from './ui/TruncatedAddress';
import { Badge } from './ui/Badge';
import { FreighterBanner } from './FreighterBanner';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const { isConnected, isConnecting, connect, disconnect, address } = useWallet();
  const autoReconnect = useStore((state) => state.autoReconnect);
  const fetchConfig = useStore((state) => state.fetchConfig);
  const isConfigLoaded = useStore((state) => state.isConfigLoaded);
  const configError = useStore((state) => state.configError);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Removed blocking loading screen to allow AppShell and Home Page to render immediately with shimmer loaders

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
      name: 'Notes', 
      href: '/notes', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    { 
      name: 'KYC', 
      href: '/kyc', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    { 
      name: 'Fund Testnet', 
      href: '/faucet', 
      icon: (active: boolean) => (
        <svg className={`w-5 h-5 ${active ? 'text-primaryAccent' : 'text-mutedText'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      )
    },
  ];

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-appBackground text-primaryText selection:bg-primaryAccent/30 selection:text-white">
      <FreighterBanner />
      <WalletConnect />

      {/* Mobile Top Navigation */}
      <div className="md:hidden flex items-center justify-between p-4 bg-darkBackground border-b border-borderSubtle">
        <div className="flex items-center gap-2 font-display">
          <img src="/logo.png" alt="Swarp Logo" className="w-7 h-7" />
          <span className="font-extrabold text-xl tracking-tight text-white">Swarp</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="text-mutedText hover:text-white p-2"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar Drawer */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-darkBackground border-r border-borderSubtle flex flex-col justify-between p-6
          transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between md:hidden">
              <span className="font-extrabold text-xl tracking-tight text-white font-display">Menu</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-mutedText hover:text-white p-2"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2 font-display">
              <img src="/logo.png" alt="Swarp Logo" className="w-7 h-7" />
              <span className="font-extrabold text-xl tracking-tight text-white">Swarp</span>
            </div>

            <nav className="flex flex-col gap-2 font-display">
              <span className="hidden md:block text-[10px] font-bold text-mutedText/60 tracking-wider uppercase mb-2 font-sans">Menu</span>
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link 
                    key={item.name} 
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-[9px] text-sm font-medium transition duration-200 group ${
                      active 
                        ? 'bg-primaryAccent/10 text-white border border-primaryAccent/20' 
                        : 'text-mutedText hover:bg-cardSurface hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon(active)}
                      <span>{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="bg-cardSurface border border-borderSubtle rounded-[12px] p-4 flex flex-col gap-3 mt-auto">
            {isConnected && address ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-mutedText uppercase font-bold tracking-wider font-display">Wallet</span>
                  <Badge variant="active">Testnet</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <TruncatedAddress address={address} />
                  <button
                    onClick={disconnect}
                    title="Disconnect Wallet"
                    className="text-mutedText hover:text-red-400 transition duration-150"
                  >
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-xs font-semibold text-white">Disconnected</span>
                </div>
                <button
                  onClick={connect}
                  disabled={isConnecting}
                  className="w-full py-2 bg-primaryAccent hover:bg-primaryHover text-white rounded-[9px] text-xs font-semibold transition duration-200 flex items-center justify-center gap-2 disabled:opacity-50 font-display"
                >
                  {isConnecting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Connecting...
                    </>
                  ) : (
                    'Connect Wallet'
                  )}
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-darkBackground p-4 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
