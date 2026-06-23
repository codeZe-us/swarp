/// <reference types="node" />

/**
 * circuits/scripts/compute-swap-witness.ts
 *
 * Computes all Poseidon hashes and Merkle-path vectors needed for the
 * ZendSwap Noir circuit and writes them to circuits/Prover.toml.
 *
 * The Poseidon2 implementation used here matches Noir's built-in
 * std::hash::poseidon2 (BN254 scalar field, width-4 state).
 *
 * Usage (from project root):
 *   npx tsx circuits/scripts/compute-swap-witness.ts
 *
 * Outputs:
 *   circuits/Prover.toml   – witness file consumed by `nargo execute`
 *
 * Zero-Value Leaf Convention
 * ──────────────────────────
 * Empty leaves are Poseidon2([0, 0, 0, 0]).slice(0,1) → i.e., Poseidon2 of a
 * single-element vector [0]. Each subsequent zero-subtree:
 *   zeros[0] = Poseidon2([0])               (single-input hash)
 *   zeros[i] = Poseidon2([zeros[i-1], zeros[i-1]])  (pair hash, i > 0)
 * The Soroban pool contract uses env.crypto().poseidon2_hash([0]) for zeros[0].
 */

import { poseidon2Hash } from '@zkpassport/poseidon2';
import * as fs from 'fs';
import * as path from 'path';

const DEPOSIT_AMOUNT    = BigInt(process.argv[2] || '500');
const EXCHANGE_RATE     = BigInt(process.argv[3] || '9200000');
const RATE_DENOMINATOR  = BigInt(process.argv[4] || '10000000');
const WITHDRAWAL_AMOUNT = DEPOSIT_AMOUNT * EXCHANGE_RATE / RATE_DENOMINATOR;

const ASSET_IN   = BigInt(process.argv[5] || '0');
const ASSET_OUT  = BigInt(process.argv[6] || '1');

const SECRET = BigInt(
  process.argv[7] || '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
);

const TREE_DEPTH = 20;

function toHex(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

function toField(n: bigint): string {
  return n.toString(10);
}

async function main(): Promise<void> {
  const commitment = poseidon2Hash([DEPOSIT_AMOUNT, ASSET_IN, SECRET]);
  const nullifierHash = poseidon2Hash([commitment, SECRET]);

  const zeros: bigint[] = new Array(TREE_DEPTH);
  zeros[0] = poseidon2Hash([0n]);
  for (let i = 1; i < TREE_DEPTH; i++) {
    zeros[i] = poseidon2Hash([zeros[i - 1], zeros[i - 1]]);
  }

  const pathElements: bigint[] = zeros.slice(0, TREE_DEPTH);
  const pathIndices:  number[]  = new Array(TREE_DEPTH).fill(0);

  let current = commitment;
  for (let i = 0; i < TREE_DEPTH; i++) {
    current = poseidon2Hash([current, zeros[i]]);
  }
  const merkleRoot = current;
  const lines: string[] = [
    `deposit_amount    = "${toField(DEPOSIT_AMOUNT)}"`,
    `withdrawal_amount = "${toField(WITHDRAWAL_AMOUNT)}"`,
    `secret            = "${toHex(SECRET)}"`,
    `asset_in          = "${toField(ASSET_IN)}"`,
    `asset_out         = "${toField(ASSET_OUT)}"`,
    `path_elements = [${pathElements.map(e => `"${toHex(e)}"`).join(', ')}]`,
    `path_indices = [${pathIndices.join(', ')}]`,
    `exchange_rate    = "${toField(EXCHANGE_RATE)}"`,
    `rate_denominator = "${toField(RATE_DENOMINATOR)}"`,
    `nullifier_hash   = "${toHex(nullifierHash)}"`,
    `asset_out_public = "${toField(ASSET_OUT)}"`,
    `merkle_root      = "${toHex(merkleRoot)}"`
  ];

  const scriptDir = typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(process.argv[1] ?? '');
  const outputPath = path.resolve(scriptDir, '..', 'Prover.toml');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
