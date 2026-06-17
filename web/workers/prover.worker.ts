/**
 * web/workers/prover.worker.ts
 *
 * Browser Web Worker: ZendSwap UltraHonk prover.
 *
 * Receives a ProverInput message, runs the Noir circuit with the
 * Barretenberg UltraHonk backend, and posts a ProverOutput message back.
 *
 * Toolchain: @noir-lang/noir_js 1.0.0-beta.9 + @aztec/bb.js 0.87.0
 * (matches the nargo 1.0.0-beta.9 / bb 0.87.0 CLI toolchain)
 *
 * Usage:
 *   const worker = new Worker(new URL('./prover.worker.ts', import.meta.url));
 *   worker.postMessage({ type: 'PROVE', input: { ... } });
 *   worker.onmessage = (e) => { ... };
 */

import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';

// ─── Message types ────────────────────────────────────────────────────────────

/** Inputs passed from the main thread to initiate proof generation. */
export interface SwapProverInput {
  // Private inputs
  deposit_amount:    string;   // decimal string (fits u64)
  withdrawal_amount: string;   // decimal string (fits u64)
  secret:            string;   // hex string with 0x prefix (252-bit random)
  asset_in:          string;   // "0" or "1"
  asset_out:         string;   // "0" or "1"
  path_elements:     string[]; // 20 hex strings (Merkle siblings)
  path_indices:      number[]; // 20 direction bits (0 or 1)

  // Public inputs
  exchange_rate:     string;   // decimal
  rate_denominator:  string;   // decimal
  nullifier_hash:    string;   // hex string with 0x prefix
  asset_out_public:  string;   // "0" or "1"
  merkle_root:       string;   // hex string with 0x prefix
}

interface ProveMessage {
  type: 'PROVE';
  input: SwapProverInput;
}

interface ReadyMessage {
  type: 'READY';
}

export interface ProverSuccessOutput {
  type: 'SUCCESS';
  proof:        Uint8Array;    // raw proof bytes (PROOF_BYTES = 14592)
  publicInputs: string[];      // hex-encoded public inputs in circuit order
}

export interface ProverErrorOutput {
  type: 'ERROR';
  message: string;
}

export type ProverOutput = ProverSuccessOutput | ProverErrorOutput;

// ─── Worker state ─────────────────────────────────────────────────────────────

let noir:    Noir             | null = null;
let backend: UltraHonkBackend | null = null;

// ─── Initialise Noir + backend once ──────────────────────────────────────────

async function init(): Promise<void> {
  if (noir) return; // already initialised

  // The compiled circuit ACIR is published to /public/swap.json by the build
  // pipeline (circuits/scripts/build.sh copies target/swap.json here).
  const circuit = await fetch('/swap.json').then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch swap.json: ${r.status}`);
    return r.json();
  });

  backend = new UltraHonkBackend(circuit.bytecode);
  noir    = new Noir(circuit);

  self.postMessage({ type: 'READY' } satisfies ReadyMessage);
}

// ─── Proof generation ─────────────────────────────────────────────────────────

async function prove(input: SwapProverInput): Promise<ProverSuccessOutput> {
  if (!noir || !backend) throw new Error('Worker not initialised');

  // Map SwapProverInput → Noir witness map (keys must match main.nr parameter names)
  const witnessMap = {
    deposit_amount:    input.deposit_amount,
    withdrawal_amount: input.withdrawal_amount,
    secret:            input.secret,
    asset_in:          input.asset_in,
    asset_out:         input.asset_out,
    path_elements:     input.path_elements,
    path_indices:      input.path_indices,
    exchange_rate:     input.exchange_rate,
    rate_denominator:  input.rate_denominator,
    nullifier_hash:    input.nullifier_hash,
    asset_out_public:  input.asset_out_public,
    merkle_root:       input.merkle_root,
  };

  // 1. Generate witness
  const { witness } = await noir.execute(witnessMap);

  // 2. Generate UltraHonk proof
  const { proof, publicInputs } = await backend.generateProof(witness);

  return {
    type: 'SUCCESS',
    proof,
    publicInputs: Array.isArray(publicInputs)
      ? publicInputs.map((p) => (typeof p === 'string' ? p : Array.from(p as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('')))
      : [],
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent<ProveMessage | ReadyMessage>) => {
  const msg = event.data;

  if (msg.type !== 'PROVE') return;

  try {
    // Initialise lazily on first prove request
    await init();
    const output = await prove(msg.input);
    (self as any).postMessage(output, [output.proof.buffer]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'ERROR', message } satisfies ProverErrorOutput);
  }
};

// Kick off initialisation eagerly so the backend WASM loads in the background
init().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  self.postMessage({ type: 'ERROR', message } satisfies ProverErrorOutput);
});
