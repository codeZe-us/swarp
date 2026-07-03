'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useStore } from '../../../store/useStore';
import { Badge } from '../../../components/ui/Badge';
import { decryptNotes } from '../../../lib/crypto';
import { Note } from '../../../store/types';
import { generateDisclosure } from '../../../lib/disclosure';
import { ASSETS, getAssetByCode } from '../../../lib/assets';

export default function SwapHistoryPage() {
  
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const notes = useStore((state) => state.notes);
  const mergeNotes = useStore((state) => state.mergeNotes);
  const exchangeRate = useStore((state) => state.exchangeRate);

  const isConnected = status === 'connected';

  
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'usdc_eurc' | 'eurc_usdc'>('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  
  const [disclosingSwapId, setDisclosingSwapId] = useState<string | null>(null);
  const [disclosureTargetKey, setDisclosureTargetKey] = useState('');
  const [disclosurePayloadStr, setDisclosurePayloadStr] = useState<string | null>(null);

  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  
  const fileInputRef = useRef<HTMLInputElement>(null);

  
  const rateNum = exchangeRate?.numerator || 9200000;
  const rateDen = exchangeRate?.denominator || 10000000;
  const decimalRate = rateNum / rateDen;

  
  const handleExportNotes = () => {
    if (!address) return;
    const encryptedBlob = localStorage.getItem(`swarp_notes_${address}`);
    if (!encryptedBlob) {
      alert('No note data available in this wallet to backup.');
      return;
    }

    const exportData = {
      address,
      version: 1,
      ciphertext: encryptedBlob,
      exportedAt: Date.now(),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `zendswap_notes_backup_${address.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        
        if (!data || typeof data.ciphertext !== 'string' || typeof data.address !== 'string') {
          alert('Import Failed: Malformed file structure. The uploaded backup is not a valid ZendSwap notes backup.');
          return;
        }

        const currentAddress = address;
        if (!currentAddress) {
          alert('Wallet connection is required to import notes.');
          return;
        }

        
        if (data.address !== currentAddress) {
          alert(`Import Failed: This backup file belongs to wallet (${data.address.slice(0, 8)}...). Please connect the correct wallet first.`);
          return;
        }

        
        const decryptedNotes = await decryptNotes(data.ciphertext, currentAddress);
        if (!Array.isArray(decryptedNotes)) {
          throw new Error('Invalid notes structure.');
        }

        
        await mergeNotes(decryptedNotes);
        alert(`Successfully imported and merged ${decryptedNotes.length} notes!`);
        
        
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error('Import notes failed:', err);
        alert('Import Failed: Decryption failed. Make sure you are connected to the correct wallet address.');
      }
    };
    reader.readAsText(file);
  };

  
  const warningNotes = useMemo(() => {
    if (!isConnected) return [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return notes.filter((n) => n.status === 'deposited' && n.createdAt < sevenDaysAgo);
  }, [notes, isConnected]);

  
  const swapHistoryList = useMemo(() => {
    if (!isConnected) return [];

    return notes.map((note) => {
      const depAmount = Number(note.amount) / 10_000_000;
      const isUSDCIn = note.asset === 'USDC';
      const outAmount = isUSDCIn ? depAmount * decimalRate : depAmount / decimalRate;
      const outAsset = isUSDCIn ? 'EURC' : 'USDC';

      return {
        id: note.id,
        status: note.status === 'withdrawn' ? 'completed' : 'pending',
        direction: isUSDCIn ? 'usdc_eurc' : 'eurc_usdc',
        depositAmount: depAmount,
        depositAsset: note.asset,
        withdrawalAmount: outAmount,
        withdrawalAsset: outAsset,
        date: note.createdAt,
        depositTxHash: note.depositTxHash,
        withdrawTxHash: note.withdrawTxHash,
        assetInId: getAssetByCode(note.asset)?.id.toString() || '0',
        assetOutId: getAssetByCode(outAsset)?.id.toString() || '1',
      };
    });
  }, [notes, isConnected, decimalRate]);

  
  const filteredHistory = useMemo(() => {
    return swapHistoryList
      .filter((swap) => {
        
        if (statusFilter !== 'all' && swap.status !== statusFilter) return false;

        
        if (directionFilter !== 'all' && swap.direction !== directionFilter) return false;

        
        if (dateRange.start) {
          const startTime = new Date(dateRange.start).getTime();
          if (swap.date < startTime) return false;
        }
        if (dateRange.end) {
          
          const endTime = new Date(dateRange.end).getTime() + 24 * 60 * 60 * 1000;
          if (swap.date > endTime) return false;
        }

        return true;
      })
      .sort((a, b) => b.date - a.date); 
  }, [swapHistoryList, statusFilter, directionFilter, dateRange]);

  
  const paginatedHistory = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredHistory, currentPage]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;

  const handleGenerateDisclosure = (swapId: string) => {
    const swap = swapHistoryList.find(s => s.id === swapId);
    if (!swap || !disclosureTargetKey) return;

    try {
      const payload = {
        version: '1',
        txHash: swap.withdrawTxHash || swap.depositTxHash || '',
        depositAmount: (swap.depositAmount * 10_000_000).toString(),
        withdrawAmount: (swap.withdrawalAmount * 10_000_000).toString(),
        assetInId: swap.assetInId,
        assetOutId: swap.assetOutId,
        timestamp: swap.date,
      };
      const encrypted = generateDisclosure(disclosureTargetKey, payload);
      setDisclosurePayloadStr(encrypted);
    } catch (err: any) {
      alert(`Failed to generate disclosure: ${err.message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto font-sans">
      
      {}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">History</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Swap history</h1>
          <p className="text-sm text-mutedText mt-1">Review your verifiable public deposits and private withdrawals.</p>
        </div>
        <Link
          href="/swap"
          className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent"
        >
          Back to Swap
        </Link>
      </div>

      {}
      {!isConnected && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-6 text-center text-xs text-mutedText font-semibold flex flex-col items-center justify-center gap-2">
          <span>Connect your wallet to load swap history logs and note backup features.</span>
        </div>
      )}

      {}
      {isConnected && warningNotes.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-[12px] p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-xs text-amber-300 leading-relaxed font-semibold">
            <span>
              ⚠️ Warning: You have {warningNotes.length} pending shielded note(s) older than 7 days.
            </span>
            <p className="text-[11px] text-mutedText mt-1 leading-normal font-normal">
              For security and privacy, notes should be withdrawn to complete the private swap. Leaving deposits unwithdrawn in the pool long-term is discouraged.
            </p>
          </div>
        </div>
      )}

      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {}
          <div className="md:col-span-1 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-5 flex flex-col justify-between min-h-[160px]">
            <div>
              <span className="text-[10px] text-mutedText uppercase font-bold tracking-wider font-display">
                Shielded notes summary
              </span>
              <div className="flex items-center gap-2.5 mt-2">
                <h3 className="text-3xl font-extrabold text-white font-mono">
                  {notes.filter(n => n.status === 'deposited').length}
                </h3>
                <Badge variant="private">shielded</Badge>
              </div>
            </div>
            <p className="text-[10px] text-mutedText leading-relaxed mt-3">
              Total created notes: <span className="text-white font-bold font-mono">{notes.length}</span> (spent/withdrawn: <span className="text-white font-bold font-mono">{notes.filter(n => n.status === 'withdrawn').length}</span>).
            </p>
          </div>

          {}
          <div className="md:col-span-2 bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-5 flex flex-col justify-between min-h-[160px]">
            <div>
              <span className="text-[10px] text-mutedText uppercase font-bold tracking-wider font-display">
                Note backup & recovery
              </span>
              <p className="text-[11px] text-mutedText leading-relaxed mt-1">
                Download your encrypted shielded notes blob. This serves as a backup mechanism if browser localStorage is cleared. 
                <span className="text-amber-400 font-bold block mt-1">⚠️ Note: Backup files are encrypted and can ONLY be decrypted by the same wallet address.</span>
              </p>
            </div>
            
            <div className="flex gap-3 mt-4 font-display">
              <button
                type="button"
                onClick={handleExportNotes}
                className="px-4 py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 shadow-[0_0_20px_rgba(123,55,168,0.2)] border-none"
              >
                Export Notes
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 bg-transparent"
              >
                Import Notes
              </button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>

        </div>
      )}

      {}
      {isConnected && (
        <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col gap-6">
          
          {}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1D1D1F] pb-5">
            <h2 className="text-md font-bold text-white font-display">Swaps Log</h2>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              
              {}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-mutedText font-display uppercase font-bold">Status</span>
                <select
                  value={statusFilter}
                  onChange={(e: any) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2 text-white outline-none focus:border-[#5E2A8C]"
                >
                  <option value="all">All States</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-mutedText font-display uppercase font-bold">Direction</span>
                <select
                  value={directionFilter}
                  onChange={(e: any) => {
                    setDirectionFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2 text-white outline-none focus:border-[#5E2A8C]"
                >
                  <option value="all">All Directions</option>
                  <option value="usdc_eurc">USDC ➔ EURC</option>
                  <option value="eurc_usdc">EURC ➔ USDC</option>
                </select>
              </div>

              {}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-mutedText font-display uppercase font-bold">Start Date</span>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange((prev) => ({ ...prev, start: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2 text-white outline-none focus:border-[#5E2A8C]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-mutedText font-display uppercase font-bold">End Date</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDateRange((prev) => ({ ...prev, end: e.target.value }));
                    setCurrentPage(1);
                  }}
                  className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2 text-white outline-none focus:border-[#5E2A8C]"
                />
              </div>

            </div>
          </div>

          {}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1D1D1F] text-mutedText font-bold uppercase tracking-wider text-[10px] font-display">
                  <th className="pb-3 pr-4">Assets Swap Pair</th>
                  <th className="pb-3 pr-4">Deposit Date</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Deposit TX</th>
                  <th className="pb-3 pr-4">Withdrawal TX</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D1D1F] font-mono">
                {paginatedHistory.map((swap) => (
                  <tr key={swap.id} className="hover:bg-[#1D1D1F]/20 transition duration-150">
                    {}
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span>
                          {swap.depositAmount.toLocaleString('en-US', { maximumFractionDigits: 5 })} {swap.depositAsset}
                        </span>
                        <svg className="w-3.5 h-3.5 text-[#B488DC]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="text-[#B488DC]">
                          {swap.withdrawalAmount.toLocaleString('en-US', { maximumFractionDigits: 5 })} {swap.withdrawalAsset}
                        </span>
                      </div>
                    </td>
                    {}
                    <td className="py-4 pr-4 text-mutedText font-semibold">
                      {new Date(swap.date).toLocaleDateString()}
                    </td>
                    {}
                    <td className="py-4 pr-4">
                      <Badge variant={swap.status === 'completed' ? 'active' : 'pending'}>
                        {swap.status}
                      </Badge>
                    </td>
                    {}
                    <td className="py-4 pr-4">
                      {swap.depositTxHash ? (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${swap.depositTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#B488DC] hover:text-[#D6C2EC] underline font-bold"
                        >
                          {swap.depositTxHash.slice(0, 6)}...{swap.depositTxHash.slice(-6)}
                        </a>
                      ) : (
                        <span className="text-mutedText/40 italic">N/A</span>
                      )}
                    </td>
                    {}
                    <td className="py-4 pr-4">
                      {swap.status === 'completed' && swap.withdrawTxHash ? (
                        <div className="flex items-center gap-4">
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${swap.withdrawTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#B488DC] hover:text-[#D6C2EC] underline font-bold"
                          >
                            {swap.withdrawTxHash.slice(0, 6)}...{swap.withdrawTxHash.slice(-6)}
                          </a>
                          <button
                            onClick={() => setDisclosingSwapId(swap.id)}
                            className="text-[10px] bg-[#1D1D1F] hover:bg-[#333336] text-white px-2 py-1 rounded-[6px] font-bold border border-[#333336] transition-colors"
                          >
                            Disclose
                          </button>
                        </div>
                      ) : (
                        <Link
                          href={`/swap?noteId=${swap.id}`}
                          className="text-[#5E2A8C] hover:text-[#B488DC] font-bold font-display underline"
                        >
                          Withdraw Now
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-mutedText font-semibold">
                      No swap history matches current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {}
          {filteredHistory.length > itemsPerPage && (
            <div className="flex items-center justify-between border-t border-[#1D1D1F] pt-4 font-display">
              <span className="text-xs text-mutedText font-semibold">
                Page <span className="text-white font-mono">{currentPage}</span> of{' '}
                <span className="text-white font-mono">{totalPages}</span> (
                <span className="text-white font-mono">{filteredHistory.length}</span> total swaps)
              </span>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-[#1D1D1F] hover:border-mutedText text-white rounded-[9px] text-xs font-bold transition duration-150 disabled:opacity-30 disabled:cursor-not-allowed bg-transparent"
                >
                  Prev
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-[#1D1D1F] hover:border-mutedText text-white rounded-[9px] text-xs font-bold transition duration-150 disabled:opacity-30 disabled:cursor-not-allowed bg-transparent"
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {}
      {disclosingSwapId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-display">
          <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#1D1D1F]">
              <h3 className="font-bold text-white text-lg">Selective Disclosure</h3>
              <button
                onClick={() => {
                  setDisclosingSwapId(null);
                  setDisclosureTargetKey('');
                  setDisclosurePayloadStr(null);
                }}
                className="text-mutedText hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-mutedText font-sans">
                Encrypt this transaction's details to an Auditor's Stellar Public Key. Only they will be able to decrypt it.
              </p>

              {!disclosurePayloadStr ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-mutedText uppercase font-bold tracking-wider">Auditor Public Key</label>
                    <input
                      type="text"
                      placeholder="G..."
                      value={disclosureTargetKey}
                      onChange={(e) => setDisclosureTargetKey(e.target.value)}
                      className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-2.5 text-xs text-white outline-none focus:border-[#5E2A8C] font-mono"
                    />
                  </div>
                  <button
                    onClick={() => handleGenerateDisclosure(disclosingSwapId)}
                    disabled={!disclosureTargetKey.startsWith('G')}
                    className="w-full py-2.5 mt-2 bg-[#5E2A8C] hover:bg-[#4A1F70] text-white rounded-[9px] text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate Encrypted Payload
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="bg-[#000000] border border-[#1D1D1F] rounded-[9px] p-3">
                    <p className="text-xs text-[#B488DC] font-mono break-all max-h-40 overflow-y-auto">
                      {disclosurePayloadStr}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(disclosurePayloadStr);
                      alert('Copied to clipboard!');
                    }}
                    className="w-full py-2 border border-[#5E2A8C] text-[#B488DC] hover:bg-[#5E2A8C]/10 rounded-[9px] text-xs font-bold transition-colors"
                  >
                    Copy Payload
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
