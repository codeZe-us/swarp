/// <reference types="node" />

/**
 * circuits/scripts/test-poseidon-parity.ts
 *
 * Verifies that three Poseidon implementations produce identical outputs over
 * the BN254 scalar field, so the circuit, on-chain contract, and client-side
 * prover are all in sync:
 *
 *   A) Noir std::hash::poseidon2  (BN254, width 4, Poseidon2 variant)
 *      → tested indirectly via the expected hashes encoded below
 *   B) env.crypto().poseidon2_hash() Soroban host function
 *      → Rust test in contracts/zendswap-pool/src/test_poseidon.rs
 *   C) circomlibjs `buildPoseidon()` (BN254, Poseidon original)
 *      → this file
 *
 * NOTE: Noir 1.0.0-beta.9 uses Poseidon2 internally, but the standard
 * BN254 field test vectors (used by circomlibjs) are for the original
 * Poseidon sponge. The vectors here test the ORIGINAL Poseidon (client-side
 * JS ↔ Soroban host) parity; Noir's Poseidon2 produces different hashes for
 * the same inputs and is only verifiable post-compilation via nargo test.
 *
 * Usage:
 *   npx tsx circuits/scripts/test-poseidon-parity.ts
 */

// @ts-ignore — circomlibjs has no type definitions
import { buildPoseidon } from 'circomlibjs';

// ─── BN254 Scalar Field modulus ─────────────────────────────────────────────
const BN254_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ─── Expected vectors (original Poseidon / BN254) ──────────────────────────
// These match the Soroban test vectors in test_poseidon.rs.
const VECTORS: { label: string; inputs: bigint[]; expectedHex: string }[] = [
  {
    label: 'Single input [1]',
    inputs: [1n],
    expectedHex:
      '0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133',
  },
  {
    label: 'Two inputs [1, 2]',
    inputs: [1n, 2n],
    expectedHex:
      '0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a',
  },
  {
    label: 'Three inputs [1, 2, 3]',
    inputs: [1n, 2n, 3n],
    expectedHex:
      '0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732',
  },
  {
    label: 'Four inputs [1, 2, 3, 4]',
    inputs: [1n, 2n, 3n, 4n],
    expectedHex:
      '0x299c867db6c1fdd79dcefa40e4510b9837e60ebb1ce0663dbaa525df65250465',
  },
  {
    label: 'Edge: zero [0]',
    inputs: [0n],
    expectedHex:
      '0x2a09a9fd93c590c26b91effbb2499f07e8f7aa12e2b4940a3aed2411cb65e11c',
  },
  {
    label: 'Edge: max u64 [0xffffffffffffffff]',
    inputs: [18446744073709551615n],
    expectedHex:
      '0x2693f54c370d174aae1942f40015c61862f0ed7022bcb6dd59ccc70d631f9055',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

type PoseidonRaw = (inputs: bigint[]) => Uint8Array | bigint[];

function extractHash(result: Uint8Array | bigint[]): bigint {
  if (result instanceof Uint8Array) {
    let n = 0n;
    for (const byte of result) n = (n << 8n) | BigInt(byte);
    return n;
  }
  return BigInt((result as bigint[])[0]);
}

function toHex(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Poseidon Parity Test (client-side JS ↔ Soroban host) ===\n');
  console.log(`BN254 field modulus: ${BN254_FIELD}\n`);

  // circomlibjs returns a hash function with a `.F` field for format conversion.
  // The raw output Uint8Array is in Montgomery form — NOT big-endian bytes.
  // Use `poseidonFn.F.toString(result)` to get the canonical decimal value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const poseidonFn = (await buildPoseidon()) as any;

  let passed = 0;
  let failed = 0;

  for (const { label, inputs, expectedHex } of VECTORS) {
    const expectedBig = BigInt(expectedHex);

    const rawResult = poseidonFn(inputs);
    const hashDecimal: string = poseidonFn.F.toString(rawResult);
    const result = BigInt(hashDecimal);
    const resultHex = toHex(result);
    const ok = result === expectedBig;

    if (ok) {
      console.log(`✅ PASS  ${label}`);
      console.log(`        output: ${resultHex}`);
      passed++;
    } else {
      console.log(`❌ FAIL  ${label}`);
      console.log(`        expected: ${expectedHex}`);
      console.log(`        got     : ${resultHex}`);
      failed++;
    }
    console.log('');
  }

  console.log(`Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.error(
      'ERROR: Parity mismatch detected. ZK proof verification will fail!\n' +
      'Check field order (must be BN254), sponge size t = len+1, and byte endianness.\n'
    );
    process.exit(1);
  }

  console.log(
    'All JS vectors match the Soroban expected hashes.\n' +
    'Run the Rust test to confirm the on-chain host function matches:\n' +
    '  cargo test --package zendswap-pool -- test_poseidon::test_poseidon_parity --nocapture\n'
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
