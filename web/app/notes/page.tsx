'use client';

import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { formatCurrency } from '../../lib/utils';
import { getAssetByCode } from '../../lib/assets';
import Link from 'next/link';

export default function NotesPage() {
  const notes = useStore((state) => state.notes);
  
  // Filter active vs spent
  const availableNotes = useMemo(() => notes.filter(n => n.status === 'deposited'), [notes]);
  const usedNotes = useMemo(() => notes.filter(n => n.status === 'withdrawn'), [notes]);

  return (
    <div className="max-w-[1000px] mx-auto pt-8 pb-12 animate-fade-in px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-[32px] font-bold text-white font-display mb-1">Notes</h1>
          <p className="text-sm text-gray-400">
            Shielded notes discovered from on-chain route events · {availableNotes.length} available
          </p>
        </div>
        <div className="text-gray-500 font-mono text-[13px] self-end pb-1">
          {notes.length} total notes
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        
        {/* Main Column */}
        <div className="space-y-6">
          
          {/* Stats Row */}
          <div className="bg-[#141419] border border-white/5 rounded-xl flex overflow-hidden">
            <div className="p-6 flex-1 border-r border-white/5">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">TOTAL NOTES</span>
              <div className="text-[32px] font-bold text-white leading-none">{notes.length}</div>
            </div>
            <div className="p-6 flex-1 border-r border-white/5">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">AVAILABLE</span>
              <div className="text-[32px] font-bold text-[#34D399] leading-none">{availableNotes.length}</div>
            </div>
            <div className="p-6 flex-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-4">USED</span>
              <div className="text-[32px] font-bold text-gray-500 leading-none">{usedNotes.length}</div>
            </div>
          </div>

          {/* Notes List */}
          <div className="space-y-4">
            {availableNotes.length === 0 ? (
              <div className="bg-[#141419] border border-white/5 rounded-xl p-8 text-center text-gray-500">
                No available shielded notes found.
              </div>
            ) : (
              availableNotes.map((note) => {
                const assetDef = getAssetByCode(note.asset);
                const hexColors: Record<string, string> = {
                  USDC: '#FFFFFF',
                  EURC: '#7C3AED',
                  MGUSD: '#A874F5',
                  YLDS: '#06B6D4'
                };
                const color = hexColors[note.asset] || '#6B7280';
                
                return (
                  <div key={note.id} className="bg-[#141419] border border-white/5 rounded-xl p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-[3px] h-8 rounded-full" style={{ backgroundColor: color }}></div>
                        <span className="text-[13px] font-bold text-gray-300 border border-white/10 bg-[#2A2A35]/30 px-3 py-1 rounded">
                          {note.asset}
                        </span>
                        <div className="flex items-center gap-1.5 text-[#34D399] text-[13px] font-bold border border-[#059669]/30 bg-[#064E3B]/20 px-3 py-1 rounded">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]"></div>
                          available
                        </div>
                      </div>
                      <Link 
                        href={`/swap?noteId=${note.id}`}
                        className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold py-2 px-5 rounded-lg text-[13px] transition-all"
                      >
                        Withdraw
                      </Link>
                    </div>

                    <div className="text-white text-[32px] font-bold mb-6 tracking-tight pl-4">
                      {formatCurrency(Number(note.amount) / 10000000, note.asset)}
                    </div>
                    
                    <div className="border-t border-white/5 pt-4 flex items-center justify-between text-[13px] font-mono text-gray-500 px-1">
                      <a 
                        href={`https://stellar.expert/explorer/testnet/tx/${note.depositTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-white transition-colors"
                      >
                        TX {note.depositTxHash ? `${note.depositTxHash.slice(0, 8)}...${note.depositTxHash.slice(-6)}` : 'pending'}
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <span className="font-sans">
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <div className="bg-[#141419] border border-white/5 rounded-xl p-6">
            <h3 className="text-white font-bold text-[15px] mb-8">How notes are found</h3>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">ROUTE EVENTS</h4>
                <p className="text-gray-300 text-[13px] leading-relaxed">
                  Pool emits encrypted payloads on each shield and transfer.
                </p>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div>
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">VIEWING KEY</h4>
                <p className="text-gray-300 text-[13px] leading-relaxed">
                  Your browser decrypts events matching your viewing public key.
                </p>
              </div>
              <div className="w-full h-px bg-white/5"></div>
              <div>
                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">USED STATUS</h4>
                <p className="text-gray-300 text-[13px] leading-relaxed">
                  Nullifiers on-chain mark notes that have been consumed.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
