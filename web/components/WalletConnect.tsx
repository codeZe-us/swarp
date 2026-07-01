'use client';

import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { TruncatedAddress } from './ui/TruncatedAddress';
import { Badge } from './ui/Badge';
import { ErrorDisplay } from './ui/ErrorDisplay';

export function WalletConnect() {
  const { isConnected, isConnecting, connect, disconnect, address, error } = useWallet();

  if (isConnecting) {
    return (
      <div className="flex items-center justify-between px-6 py-3 bg-cardSurface border-b border-borderSubtle text-white text-sm z-50 shadow-md">
        <div className="flex items-center gap-2">
          <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-primaryAccent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-medium text-slate-200">Connecting to Stellar Wallet...</span>
        </div>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center justify-between px-6 py-3 bg-cardSurface border-b border-borderSubtle text-white text-sm z-50 shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-mutedText font-medium">Wallet Connected:</span>
            <TruncatedAddress address={address} />
          </div>
          <Badge variant="active">Testnet</Badge>
        </div>
        <button
          onClick={disconnect}
          className="px-3 py-1 bg-transparent hover:bg-white/5 border border-borderSubtle hover:border-white text-slate-300 hover:text-white rounded-md text-xs font-semibold transition duration-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center justify-between px-6 py-3 bg-primaryAccent text-white text-sm font-medium z-50 shadow-md">
        <div className="flex items-center gap-2">
          <span>Connect a Stellar wallet to deposit, pay and prove.</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={connect}
            className="px-4 py-1 bg-white text-primaryAccent hover:bg-slate-100 rounded-md font-semibold text-xs transition duration-200"
          >
            Connect
          </button>
        </div>
      </div>
      {error && (
        <div className="px-6 py-4 bg-appBackground border-b border-borderSubtle">
          <ErrorDisplay error={error} variant="inline" />
        </div>
      )}
    </div>
  );
}
export default WalletConnect;
