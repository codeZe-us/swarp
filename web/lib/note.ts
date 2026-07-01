import { poseidon2Hash } from '@zkpassport/poseidon2';
import { generateSecret } from './crypto';
import { Note } from '../store/types';

/**
 * Creates a new shielded Note:
 * - Generates a 252-bit random secret if not provided.
 * - Computes commitment = Poseidon2([amount, assetId, secret]).
 * - Returns a store-friendly Note object (representing BigInts as strings).
 */
export function createNote(
  amount: bigint,
  assetId: number, // 0-4 for USDC, EURC, MGUSD, YLDS, XLM
  secret?: bigint
): Note {
  const secretVal = secret ?? generateSecret();
  const commitment = poseidon2Hash([amount, BigInt(assetId), secretVal]);
  const ASSET_CODES = ['USDC', 'EURC', 'MGUSD', 'YLDS', 'XLM'];
  const assetName = ASSET_CODES[assetId] || 'UNKNOWN';

  // Support environments without window.crypto.randomUUID
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
  };
}

/**
 * Computes the nullifier hash for note withdrawal:
 * - nullifier = Poseidon2([commitment, secret]).
 */
export function computeNullifier(commitment: bigint, secret: bigint): bigint {
  return poseidon2Hash([commitment, secret]);
}

/**
 * Converts a Note to a JSON-safe string representation.
 */
export function serializeNote(note: Note): string {
  return JSON.stringify(note);
}

/**
 * Parses JSON back to a Note.
 */
export function deserializeNote(json: string): Note {
  return JSON.parse(json) as Note;
}
