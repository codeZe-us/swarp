'use client';

import React from 'react';

export default function KycPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Application</span>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-extrabold text-white">KYC Verification</h1>
          <span className="text-[10px] bg-borderSubtle text-mutedText px-2 py-0.5 rounded-full font-extrabold tracking-wider">
            SOON
          </span>
        </div>
        <p className="text-sm text-mutedText mt-1">Verify compliance identity parameters in zero-knowledge.</p>
      </div>

      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primaryAccent/10 border border-primaryAccent/20 flex items-center justify-center text-primaryAccent">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Compliance & Identity Shell</h2>
          <p className="text-sm text-mutedText mt-2 max-w-sm">Compliance registry verification module. Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
