'use client';

import React, { useState } from 'react';

interface TruncatedAddressProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  address: string;
}

export const TruncatedAddress: React.FC<TruncatedAddressProps> = ({ 
  address, 
  className = '', 
  ...props 
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  const truncated = address && address.length > 10 
    ? `${address.slice(0, 4)}...${address.slice(-5)}` 
    : address;

  return (
    <button
      onClick={handleCopy}
      title="Click to copy full address"
      className={`font-mono text-xs text-mutedText hover:text-white transition duration-150 flex items-center gap-1.5 focus:outline-none select-none ${className}`}
      {...props}
    >
      <span>{truncated}</span>
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 opacity-60 hover:opacity-100 transition duration-150" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      )}
    </button>
  );
};
