'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '../../../store/useStore';
import { Badge } from '../../../components/ui/Badge';

export default function PayrollHistoryPage() {
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const transactions = useStore((state) => state.transactions);
  
  const isConnected = status === 'connected';

  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const payrollTransactions = useMemo(() => {
    if (!isConnected) return [];
    return transactions.filter(tx => tx.type === 'payroll');
  }, [transactions, isConnected]);

  const filteredHistory = useMemo(() => {
    return payrollTransactions
      .filter((tx) => {
        if (dateRange.start) {
          const startTime = new Date(dateRange.start).getTime();
          if (tx.timestamp < startTime) return false;
        }
        if (dateRange.end) {
          const endTime = new Date(dateRange.end).getTime() + 24 * 60 * 60 * 1000;
          if (tx.timestamp > endTime) return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [payrollTransactions, dateRange]);

  const paginatedHistory = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredHistory, currentPage]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage) || 1;

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto font-sans">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">History</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Payroll history</h1>
          <p className="text-sm text-mutedText mt-1">Review your executed private payroll transfers.</p>
        </div>
        <Link
          href="/payroll"
          className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent"
        >
          Back to Payroll
        </Link>
      </div>

      {!isConnected && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-[12px] p-6 text-center text-xs text-mutedText font-semibold flex flex-col items-center justify-center gap-2">
          <span>Connect your wallet to load payroll history logs.</span>
        </div>
      )}

      {isConnected && (
        <div className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1D1D1F] pb-5">
            <h2 className="text-md font-bold text-white font-display">Payroll Log</h2>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1D1D1F] text-mutedText font-bold uppercase tracking-wider text-[10px] font-display">
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Privacy</th>
                  <th className="pb-3 pr-4">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D1D1F] font-mono">
                {paginatedHistory.map((tx) => (
                  <tr key={tx.txHash} className="hover:bg-[#1D1D1F]/20 transition duration-150">
                    <td className="py-4 pr-4 text-mutedText font-semibold">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <span>
                          {Number(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 5 })} {tx.asset}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <Badge variant="private">
                        {tx.privacy}
                      </Badge>
                    </td>
                    <td className="py-4 pr-4">
                      {tx.txHash ? (
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#B488DC] hover:text-[#D6C2EC] underline font-bold"
                        >
                          {tx.txHash.slice(0, 6)}...{tx.txHash.slice(-6)}
                        </a>
                      ) : (
                        <span className="text-mutedText/40 italic">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-mutedText font-semibold">
                      No payroll history matches current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredHistory.length > itemsPerPage && (
            <div className="flex items-center justify-between border-t border-[#1D1D1F] pt-4 font-display">
              <span className="text-xs text-mutedText font-semibold">
                Page <span className="text-white font-mono">{currentPage}</span> of{' '}
                <span className="text-white font-mono">{totalPages}</span> (
                <span className="text-white font-mono">{filteredHistory.length}</span> total transfers)
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
    </div>
  );
}
