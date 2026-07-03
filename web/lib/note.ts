import { poseidon2Hash } from '@zkpassport/poseidon2';
import { generateSecret } from './crypto';
import { Note } from '../store/types';

export function createNote(
  amount: bigint,
  assetId: number, 
  poolContractId?: string,
  secret?: bigint
): Note {
  const secretVal = secret ?? generateSecret();
  const commitment = poseidon2Hash([amount, BigInt(assetId), secretVal]);
  const ASSET_CODES = ['USDC', 'EURC', 'MGUSD', 'YLDS', 'XLM'];
  const assetName = ASSET_CODES[assetId] || 'UNKNOWN';

  const id = typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

  return {
    id,
    amount: amount.toString(),
    asset: assetName,
    secret: secretVal.toString(),
    commitment: commitment.toString(),
    leafIndex: null,
    depositTxHash: null,
    withdrawTxHash: null,
    status: 'created',
    createdAt: Date.now(),
    poolContractId,
  };
}

export function computeNullifier(commitment: bigint, secret: bigint): bigint {
  return poseidon2Hash([commitment, secret]);
}

export function serializeNote(note: Note): string {
  return JSON.stringify(note);
}

export function deserializeNote(json: string): Note {
  return JSON.parse(json) as Note;
}
