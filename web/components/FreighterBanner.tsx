'use client';

import React, { useEffect, useState } from 'react';
import { isConnected } from '@stellar/freighter-api';

export function FreighterBanner() {
  const [isFreighterMissing, setIsFreighterMissing] = useState(false);

  useEffect(() => {
    
    const timer = setTimeout(async () => {
      try {
        const result = await isConnected();
        if (!result.isConnected) {
          setIsFreighterMissing(true);
        }
      } catch (e) {
        setIsFreighterMissing(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!isFreighterMissing) return null;

  return (
    <div className="bg-red-500/10 border-b border-red-500/20 text-red-400 px-6 py-3 flex items-center justify-between text-sm shadow-sm z-50 relative">
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          <strong>Freighter wallet not found.</strong> ZendSwap requires the Freighter browser extension to connect your Stellar wallet.
        </span>
      </div>
      <a
        href="https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md font-medium text-xs transition duration-200 whitespace-nowrap ml-4"
      >
        Install Freighter
      </a>
    </div>
  );
}
