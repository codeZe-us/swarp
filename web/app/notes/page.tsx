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
    <div className="max-w-[1200px] mx-auto pt-8 pb-12 animate-fade-in px-4">
      <div className="mb-10">
        <h1 className="text-[32px] font-bold text-white mb-2">Notes</h1>
        <p className="text-gray-400 text-sm">
          Shielded notes discovered from on-chain route events · {availableNotes.length} available
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        
        {/* Main Column */}
        <div className="space-y-6">
          
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#141419] border border-white/5 rounded-xl p-5">
              <div className="text-gray-500 text-[10px] font-bold tracking-wider uppercase mb-2">Total Notes</div>
              <div className="text-white text-3xl font-extrabold">{notes.length}</div>
            </div>
            <div className="bg-[#141419] border border-white/5 rounded-xl p-5">
              <div className="text-emerald-500 text-[10px] font-bold tracking-wider uppercase mb-2">Available</div>
              <div className="text-emerald-400 text-3xl font-extrabold">{availableNotes.length}</div>
            </div>
            <div className="bg-[#141419] border border-white/5 rounded-xl p-5">
              <div className="text-gray-500 text-[10px] font-bold tracking-wider uppercase mb-2">Used</div>
              <div className="text-white text-3xl font-extrabold">{usedNotes.length}</div>
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
                const borderColor = assetDef?.code === 'EURC' ? 'border-[#1A365D]' : 
                                  assetDef?.code === 'USDC' ? 'border-[#2775CA]' : 
                                  assetDef?.code === 'YLDS' ? 'border-[#D69E2E]' : 'border-[#E53E3E]';
                                  
                return (
                  <div key={note.id} className="bg-[#141419] border border-white/5 rounded-xl flex overflow-hidden">
                    {/* Left Border color bar */}
                    <div className={`w-1.5 flex-shrink-0 ${borderColor.replace('border-', 'bg-')}`}></div>
                    
                    <div className="flex-1 p-6 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-white font-bold text-sm bg-white/5 px-2 py-1 rounded">{note.asset}</span>
                          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold bg-emerald-400/10 px-2 py-1 rounded">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                            available
                          </div>
                        </div>
                        <div className="text-white text-5xl font-extrabold tracking-tight mb-4">
                          {formatCurrency(Number(note.amount) / 10000000, note.asset)}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
                          <a 
                            href={`https://stellar.expert/explorer/testnet/tx/${note.depositTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 hover:text-white transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            {note.depositTxHash ? `${note.depositTxHash.slice(0, 16)}...` : 'pending'}
                          </a>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-6 justify-between h-full">
                        <div className="text-gray-500 text-xs font-medium">
                          {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <Link 
                          href={`/swap?noteId=${note.id}`}
                          className="bg-gradient-to-r from-[#6b21a8] to-[#4c1d95] hover:from-[#7e22ce] hover:to-[#5b21b6] text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all"
                        >
                          Withdraw
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          <div className="bg-[#141419] border border-white/5 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="text-white font-bold text-sm">How notes are found</h3>
            </div>
            
            <div className="p-5 space-y-6 text-sm">
              <div>
                <h4 className="text-white font-bold mb-2">1. ROUTE EVENTS</h4>
                <p className="text-gray-400 leading-relaxed">
                  Your browser scans the Soroban testnet for route events matching your viewing key. When a match is found, the note is added here automatically.
                </p>
              </div>
              
              <div>
                <h4 className="text-white font-bold mb-2">2. VIEWING KEY</h4>
                <p className="text-gray-400 leading-relaxed">
                  Only you have the viewing key to decrypt the note value and secret. The network only sees a commitment hash.
                </p>
              </div>

              <div>
                <h4 className="text-white font-bold mb-2">3. USED STATUS</h4>
                <p className="text-gray-400 leading-relaxed">
                  When a note is withdrawn, its nullifier is recorded on-chain, rendering it invalid for future use. Your local client checks this status.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
