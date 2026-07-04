'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const pageVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};
import { useStore } from '../../store/useStore';
import { ShimmerLoader } from '../../components/ui/ShimmerLoader';
import { formatCurrency } from '../../lib/utils';
import { getAssetByCode } from '../../lib/assets';
import Link from 'next/link';

export default function NotesPage() {
  const notes = useStore((state) => state.notes);
  
  
  const availableNotes = useMemo(() => notes.filter(n => n.status === 'deposited'), [notes]);
  const usedNotes = useMemo(() => notes.filter(n => n.status === 'withdrawn'), [notes]);

  const [isFetchingData, setIsFetchingData] = useState(true);

  
  useEffect(() => {
    const timer = setTimeout(() => setIsFetchingData(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="max-w-[860px] mx-auto pt-8 pb-12 px-4"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-start justify-between mb-10">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Shielded</span>
          <h1 className="text-3xl font-extrabold text-white font-display mt-1">Notes</h1>
          <p className="text-sm text-mutedText mt-1">
            Shielded notes from on-chain events · {availableNotes.length} available
          </p>
        </div>
        <div className="text-mutedText font-mono text-[13px] self-end pb-1">
          {notes.length} total
        </div>
      </motion.div>

      {/* Stats */}
      {isFetchingData ? (
        <motion.div variants={itemVariants} className="bg-[#141419] border border-white/5 rounded-xl flex overflow-hidden mb-6 min-h-[120px]">
          <ShimmerLoader className="w-full h-full min-h-[120px]" borderRadius={12} />
        </motion.div>
      ) : (
      <motion.div variants={itemVariants} className="bg-[#141419] border border-white/5 rounded-xl flex overflow-hidden mb-6">
        <div className="p-6 flex-1 border-r border-white/5">
          <span className="text-[11px] font-bold text-mutedText uppercase tracking-widest block mb-4">TOTAL NOTES</span>
          <div className="text-[32px] font-extrabold text-white leading-none font-display">{notes.length}</div>
        </div>
        <div className="p-6 flex-1 border-r border-white/5">
          <span className="text-[11px] font-bold text-mutedText uppercase tracking-widest block mb-4">AVAILABLE</span>
          <div className="text-[32px] font-extrabold text-[#34D399] leading-none font-display">{availableNotes.length}</div>
        </div>
        <div className="p-6 flex-1">
          <span className="text-[11px] font-bold text-mutedText uppercase tracking-widest block mb-4">USED</span>
          <div className="text-[32px] font-extrabold text-mutedText leading-none font-display">{usedNotes.length}</div>
        </div>
      </motion.div>
      )}

      {/* List */}
      <motion.div variants={itemVariants} className="space-y-4">
        {isFetchingData ? (
          <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] overflow-hidden min-h-[180px]">
            <ShimmerLoader className="w-full h-full min-h-[180px]" borderRadius={13} />
          </div>
        ) : availableNotes.length === 0 ? (
          <div className="bg-[#141419] border border-white/5 rounded-xl p-8 text-center text-mutedText">
            No available shielded notes found.
          </div>
        ) : (
          availableNotes.map((note) => {
            const assetDef = getAssetByCode(note.asset);
            const hexColors: Record<string, string> = {
              USDC: '#FFFFFF',
              EURC: '#5E2A8C',
              MGUSD: '#A874F5',
              YLDS: '#06B6D4'
            };
            const color = hexColors[note.asset] || '#6B7280';
            
            return (
              <motion.div variants={itemVariants} key={note.id} className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-[3px] h-8 rounded-full" style={{ backgroundColor: color }}></div>
                    <span className="text-[13px] font-bold text-white border border-white/10 bg-[#1D1D1F] px-3 py-1 rounded-[6px] font-display">
                      {note.asset}
                    </span>
                    <div className="flex items-center gap-1.5 text-[#34D399] text-[11px] font-bold border border-[#059669]/30 bg-[#064E3B]/20 px-3 py-1 rounded-[6px] font-display uppercase tracking-wider">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#34D399]"></div>
                      available
                    </div>
                  </div>
                  <Link 
                    href={`/swap?noteId=${note.id}`}
                    className="bg-[#5E2A8C] hover:bg-[#4A1F70] hover:brightness-110 text-white font-bold py-2 px-5 rounded-[9px] text-[13px] transition-all font-display"
                  >
                    Withdraw
                  </Link>
                </div>

                <div className="text-white text-[32px] font-extrabold mb-6 tracking-tight pl-4 font-display">
                  {formatCurrency(Number(note.amount) / 10000000, note.asset)}
                </div>
                
                <div className="border-t border-white/5 pt-4 flex items-center justify-between text-[13px] font-mono text-mutedText px-1">
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
                  <span>
                    {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </motion.div>
    </motion.div>
  );
}
