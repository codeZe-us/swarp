'use client';

import React from 'react';

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Application</span>
        <h1 className="text-3xl font-extrabold text-white mt-1">Team</h1>
        <p className="text-sm text-mutedText mt-1">Manage team members and authorization permissions.</p>
      </div>

      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primaryAccent/10 border border-primaryAccent/20 flex items-center justify-center text-primaryAccent">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Team Management Shell</h2>
          <p className="text-sm text-mutedText mt-2 max-w-sm">The team management configuration dashboard is set up. Ready for admin authorization logic.</p>
        </div>
      </div>
    </div>
  );
}
