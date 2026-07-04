'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const pageVariants: any = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
};

const itemVariants: any = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};
import { verifyDisclosure, DisclosurePayload } from '../../lib/disclosure';
import { Badge } from '../../components/ui/Badge';

export default function AuditPage() {
  const [auditorSecretKey, setAuditorSecretKey] = useState('');
  const [encryptedPayload, setEncryptedPayload] = useState('');
  const [disclosureResult, setDisclosureResult] = useState<DisclosurePayload | null>(null);
  const [error, setError] = useState('');

  const handleVerify = () => {
    setError('');
    setDisclosureResult(null);

    if (!auditorSecretKey.startsWith('S')) {
      setError('Invalid Secret Key format. Must start with S.');
      return;
    }

    if (!encryptedPayload) {
      setError('Please enter the encrypted payload.');
      return;
    }

    try {
      const result = verifyDisclosure(auditorSecretKey, encryptedPayload);
      if (result) {
        setDisclosureResult(result);
      } else {
        setError('Failed to decrypt. The payload may not be intended for this key, or the data is corrupt.');
      }
    } catch (err: any) {
      setError(err.message || 'Decryption error.');
    }
  };

  return (
    <motion.div 
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-6 max-w-3xl mx-auto font-sans"
    >
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-[#B488DC] tracking-wider uppercase font-display">Compliance</span>
          <h1 className="text-3xl font-extrabold text-white mt-1 font-display">Auditor Portal</h1>
          <p className="text-sm text-mutedText mt-1">Decrypt and verify selective disclosures provided by users.</p>
        </div>
        <Link
          href="/swap"
          className="px-4 py-2 border border-[rgba(94,42,140,0.4)] text-white hover:bg-[#5E2A8C]/10 font-bold rounded-[9px] text-xs uppercase tracking-wider transition duration-150 font-display bg-transparent"
        >
          Back to Swap
        </Link>
      </motion.div>

      <motion.div variants={itemVariants} className="bg-[#0B0B0C] border border-[#1D1D1F] rounded-[13px] p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-mutedText uppercase tracking-wider font-display">
            Auditor Secret Key
          </label>
          <input
            type="password"
            placeholder="S..."
            value={auditorSecretKey}
            onChange={(e) => setAuditorSecretKey(e.target.value)}
            className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-3 text-sm text-white focus:border-[#5E2A8C] focus:ring-0 outline-none font-mono"
          />
          <p className="text-[10px] text-amber-500/80 mt-1">
            Never enter your real mainnet secret key here. This is for testnet demonstration only.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-mutedText uppercase tracking-wider font-display">
            Encrypted Disclosure Payload
          </label>
          <textarea
            rows={5}
            placeholder="eyJlcGhlbWVyYWxQdWJsaWNLZXkiOi..."
            value={encryptedPayload}
            onChange={(e) => setEncryptedPayload(e.target.value)}
            className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-3 text-sm text-white focus:border-[#5E2A8C] focus:ring-0 outline-none font-mono resize-none"
          />
        </div>

        <button
          onClick={handleVerify}
          disabled={!auditorSecretKey || !encryptedPayload}
          className="w-full py-3 rounded-[12px] font-bold text-sm tracking-wide uppercase transition duration-200 flex items-center justify-center gap-2 bg-gradient-to-br from-[#5E2A8C] to-[#4A1F70] hover:brightness-110 text-white disabled:opacity-50 disabled:cursor-not-allowed font-display"
        >
          Verify Disclosure
        </button>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-[12px] text-sm font-semibold">
            {error}
          </div>
        )}

        {disclosureResult && (
          <div className="mt-4 flex flex-col gap-4 border-t border-[#1D1D1F] pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Valid Disclosure
              </h3>
              <Badge variant="active">Verified</Badge>
            </div>
            
            <div className="bg-[#000000] border border-[#1D1D1F] rounded-[12px] p-4 font-mono text-sm flex flex-col gap-3">
              <div className="flex justify-between">
                <span className="text-mutedText">Transaction Hash:</span>
                <a href={`https://stellar.expert/explorer/testnet/tx/${disclosureResult.txHash}`} target="_blank" rel="noreferrer" className="text-[#B488DC] underline">
                  {disclosureResult.txHash.slice(0, 12)}...
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-mutedText">Deposit Amount:</span>
                <span className="text-white">{disclosureResult.depositAmount} base units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mutedText">Withdraw Amount:</span>
                <span className="text-white">{disclosureResult.withdrawAmount} base units</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mutedText">Asset In ID:</span>
                <span className="text-white">{disclosureResult.assetInId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mutedText">Asset Out ID:</span>
                <span className="text-white">{disclosureResult.assetOutId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mutedText">Date:</span>
                <span className="text-white">{new Date(disclosureResult.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
