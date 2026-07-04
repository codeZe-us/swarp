import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Transaction, Note } from '../../store/types';
import { Badge } from './Badge';

interface TransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  notes: Note[];
  exchangeRate: { numerator: number; denominator: number };
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  isOpen,
  onClose,
  transaction,
  notes,
  exchangeRate,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !transaction) return null;

  // Find paired note in local storage notes
  const note = notes.find((n) =>
    transaction.type === 'deposit'
      ? n.depositTxHash === transaction.txHash
      : n.withdrawTxHash === transaction.txHash
  );

  const isDeposit = transaction.type === 'deposit';
  const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${transaction.txHash}`;

  // Conversion logic matching ZendSwap contract math
  const rateVal = exchangeRate.numerator / exchangeRate.denominator;

  // Retrieve paired information
  let pairedInfo = null;
  if (note) {
    const depAmt = Number(note.amount) / 10_000_000;
    const withAmt = note.asset === 'USDC' ? depAmt * rateVal : depAmt / rateVal;
    const withAsset = note.asset === 'USDC' ? 'EURC' : 'USDC';

    if (isDeposit) {
      if (note.status === 'withdrawn') {
        pairedInfo = {
          type: 'withdrawal',
          amount: withAmt.toLocaleString('en-US', { maximumFractionDigits: 7 }),
          asset: withAsset,
          date: new Date(note.createdAt).toLocaleDateString(),
          txHash: note.withdrawTxHash,
          status: 'Withdrawn (Unlinked & Private)',
        };
      } else {
        pairedInfo = {
          type: 'pending_withdrawal',
          noteId: note.id,
          status: 'Pending Withdrawal (Shielded)',
        };
      }
    } else {
      // It's a withdrawal
      pairedInfo = {
        type: 'deposit',
        amount: depAmt.toLocaleString('en-US', { maximumFractionDigits: 7 }),
        asset: note.asset,
        date: new Date(note.createdAt).toLocaleDateString(),
        txHash: note.depositTxHash,
        status: 'Deposited (Public Anchor)',
      };
    }
  }

  // Handle overlay background click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-opacity duration-300"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md bg-[#0B0B0C] border border-purple-500/50 animate-border-pulse rounded-[13px] shadow-[0_0_30px_rgba(124,58,237,0.15)] relative flex flex-col overflow-hidden transition-all duration-300 font-sans"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-mutedText hover:text-white transition duration-150 p-1"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Modal Content */}
        <div className="p-6 flex flex-col gap-5">
          <div>
            <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">
              Transaction details
            </span>
            <h2 className="text-xl font-extrabold text-white mt-1 font-display">
              {isDeposit ? 'Deposit to Pool' : 'Shielded Swap Withdrawal'}
            </h2>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-4 bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-4 font-mono">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-mutedText font-sans font-semibold">Amount</span>
              <span className="text-lg font-bold text-white">
                {parseFloat(transaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })} {transaction.asset}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-mutedText font-sans font-semibold">Privacy Status</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={transaction.privacy === 'private' ? 'private' : 'public'}>
                  {transaction.privacy}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 col-span-2 border-t border-[#1D1D1F] pt-3 mt-1">
              <span className="text-[10px] text-mutedText font-sans font-semibold">Transaction Hash</span>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#B488DC] hover:text-[#D6C2EC] underline break-all font-bold transition duration-150"
              >
                {transaction.txHash}
              </a>
            </div>
          </div>

          {/* Details list */}
          <div className="flex flex-col gap-3 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-[#1D1D1F]">
              <span className="text-mutedText font-semibold">Date & Time</span>
              <span className="text-white font-bold font-mono">
                {new Date(transaction.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#1D1D1F]">
              <span className="text-mutedText font-semibold">Status</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Confirmed
              </span>
            </div>
            <div className="flex justify-between items-start py-2 border-b border-[#1D1D1F]">
              <span className="text-mutedText font-semibold min-w-[100px]">Network Info</span>
              <span className="text-white font-bold text-right leading-relaxed">
                Stellar Soroban Testnet
              </span>
            </div>
          </div>


          {/* Paired Swap information */}
          {pairedInfo ? (
            <div className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-4 flex flex-col gap-2">
              <span className="text-[10px] text-mutedText font-sans font-semibold uppercase tracking-wider">
                Paired Swap Information
              </span>
              
              {pairedInfo.type === 'pending_withdrawal' ? (
                <div className="flex flex-col gap-3 mt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-amber-400 font-bold">Unwithdrawn Deposit</span>
                    <Badge variant="pending">Shielded</Badge>
                  </div>
                  <p className="text-[11px] text-mutedText leading-normal">
                    This deposit has not yet been swapped/withdrawn. You can complete your swap private withdrawal now.
                  </p>
                  <Link
                    href={`/swap?noteId=${pairedInfo.noteId}`}
                    onClick={onClose}
                    className="w-full py-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white font-bold rounded-[9px] text-xs uppercase tracking-wider text-center transition duration-150 shadow-[0_0_20px_rgba(123,55,168,0.2)] font-display"
                  >
                    Withdraw Now
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-mutedText font-semibold">Paired {pairedInfo.type === 'deposit' ? 'Deposit' : 'Withdrawal'}</span>
                    <span className="text-white font-bold font-mono">
                      {pairedInfo.amount} {pairedInfo.asset}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-mutedText font-semibold">Date</span>
                    <span className="text-white font-bold font-mono">{pairedInfo.date}</span>
                  </div>
                  {pairedInfo.txHash && (
                    <div className="flex justify-between items-center">
                      <span className="text-mutedText font-semibold">Explorer Link</span>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${pairedInfo.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#B488DC] hover:text-[#D6C2EC] underline font-bold font-mono"
                      >
                        {pairedInfo.txHash.slice(0, 6)}...{pairedInfo.txHash.slice(-6)}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-mutedText/50 italic text-center">
              No paired note matches this transaction hash in local storage.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
