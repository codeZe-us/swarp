'use client';

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/ui/Button';
import { submitVerifyKyc } from '@/lib/contracts';
import { useToastStore } from '@/store/useToast';

export default function KycPage() {
  const { address: walletAddress } = useWallet();
  const addToast = useToastStore((state) => state.addToast);
  const [isProving, setIsProving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [kycStatus, setKycStatus] = useState<'unverified' | 'verified'>('unverified');

  useEffect(() => {
    const savedStatus = localStorage.getItem(`kyc_status_${walletAddress}`);
    if (savedStatus === 'verified') {
      setKycStatus('verified');
    } else {
      setKycStatus('unverified');
    }
  }, [walletAddress]);

  const handleVerifyKyc = async () => {
    if (!walletAddress) {
      addToast({ severity: 'error', message: 'Please connect your wallet first' });
      return;
    }

    try {
      setIsProving(true);
      addToast({ severity: 'info', message: 'Generating Zero-Knowledge KYC Proof locally...' });

      const circuitRes = await fetch('/kyc.json');
      const circuit = await circuitRes.json();

      const dataRes = await fetch(`/api/kyc-mock-data?wallet=${walletAddress}`);
      const kycInput = await dataRes.json();
      
      const worker = new Worker('/kyc.worker.js', { type: 'module' });
      
      const { proof, publicInputs } = await new Promise<{ proof: Uint8Array, publicInputs: string[] }>((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'done') {
            resolve({ proof: e.data.proof, publicInputs: e.data.publicInputs });
            worker.terminate();
          } else if (e.data.type === 'error') {
            reject(new Error(e.data.error));
            worker.terminate();
          } else {
            console.log('Worker status:', e.data.type);
          }
        };
        worker.postMessage({ type: 'PROVE_KYC', circuit, input: kycInput });
      });
      
      setIsProving(false);
      setIsVerifying(true);
      addToast({ severity: 'info', message: 'Submitting proof to Soroban...' });
      
      const txRes = await submitVerifyKyc(walletAddress, proof, publicInputs);
      if (txRes.status !== 'SUCCESS') {
        throw new Error('Transaction failed on-chain');
      }
      
      setKycStatus('verified');
      if (walletAddress) {
        localStorage.setItem(`kyc_status_${walletAddress}`, 'verified');
      }
      addToast({ severity: 'success', message: 'KYC successfully verified on-chain!' });
    } catch (error: any) {
      console.error(error);
      addToast({ severity: 'error', message: error.message || 'Failed to verify KYC' });
    } finally {
      setIsProving(false);
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div>
        <span className="text-[10px] font-bold text-primaryAccent tracking-wider uppercase">Application</span>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-extrabold text-white">KYC Verification</h1>
        </div>
        <p className="text-sm text-mutedText mt-1">Verify compliance identity parameters in zero-knowledge without revealing your personal data.</p>
      </div>

      <div className="bg-cardSurface border border-borderSubtle rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px] text-center gap-6">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${kycStatus === 'verified' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-primaryAccent/10 border border-primaryAccent/20 text-primaryAccent'}`}>
          {kycStatus === 'verified' ? (
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          )}
        </div>
        
        <div>
          <h2 className="text-xl font-bold text-white">
            {kycStatus === 'verified' ? 'Identity Verified' : 'Compliance & Identity Shell'}
          </h2>
          <p className="text-sm text-mutedText mt-2 max-w-sm mx-auto">
            {kycStatus === 'verified' 
              ? 'Your Zero-Knowledge proof has been accepted. You can now interact with the private pool.'
              : 'Generate a Zero-Knowledge proof locally and submit it to Soroban to verify your credentials.'}
          </p>
        </div>

        <div className="mt-4 w-full max-w-sm">
          <Button
            className="w-full text-base py-3 font-bold"
            disabled={!walletAddress || isProving || isVerifying || kycStatus === 'verified'}
            onClick={handleVerifyKyc}
          >
            {!walletAddress ? 'Connect Wallet' :
             kycStatus === 'verified' ? 'Verified ✓' :
             isProving ? 'Generating Proof (Local)...' :
             isVerifying ? 'Verifying on Soroban...' :
             'Generate Proof & Verify'}
          </Button>
        </div>
      </div>

      <div className="bg-cardSurface/40 border border-borderSubtle rounded-2xl p-6 w-full text-left mt-2">
        <h3 className="text-base font-bold text-white mb-3">How it works</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-mutedText font-medium">
          <li><strong className="text-white">Local Proving:</strong> A Zero-Knowledge proof is generated directly in your browser.</li>
          <li><strong className="text-white">Data Privacy:</strong> Your personal identity data never leaves your device.</li>
          <li><strong className="text-white">On-Chain Verification:</strong> Only the cryptographic proof is submitted to Soroban.</li>
          <li><strong className="text-white">Pool Access:</strong> Once verified, your wallet is cleared to interact with the private liquidity pool.</li>
        </ol>
      </div>
    </div>
  );
}
