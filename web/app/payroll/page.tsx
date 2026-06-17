'use client';

import React from 'react';

export default function PayrollPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Application</span>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-extrabold text-white">Payroll</h1>
          <span className="text-[10px] bg-borderSubtle text-mutedText px-2 py-0.5 rounded-full font-extrabold tracking-wider">
            SOON
          </span>
        </div>
        <p className="text-sm text-mutedText mt-1">Distribute private payments to multiple team members.</p>
      </div>

      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primaryAccent/10 border border-primaryAccent/20 flex items-center justify-center text-primaryAccent">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Payroll Shell</h2>
          <p className="text-sm text-mutedText mt-2 max-w-sm">Private payroll distribution system dashboard. Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
