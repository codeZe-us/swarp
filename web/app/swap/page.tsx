'use client';

import React from 'react';

export default function SwapPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Application</span>
        <h1 className="text-3xl font-extrabold text-white mt-1">Swap</h1>
        <p className="text-sm text-mutedText mt-1">Trade assets privately in zero-knowledge.</p>
      </div>

      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primaryAccent/10 border border-primaryAccent/20 flex items-center justify-center text-primaryAccent">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Private Swap Shell</h2>
          <p className="text-sm text-mutedText mt-2 max-w-sm">The private token swap module is set up. Ready for Soroban smart contract integration.</p>
        </div>
      </div>
    </div>
  );
}
