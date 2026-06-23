/**
 * web/workers/prover.worker.ts
 *
 * Browser Web Worker: ZendSwap UltraHonk prover.
 *
 * Receives a ProverInput message containing the circuit artifact and witness inputs,
 * runs the Noir circuit with the Barretenberg UltraHonk backend, and reports progress
 * stages: 'loading' -> 'computing' -> 'proving' -> 'done' or 'error'.
 *
 * Toolchain: @noir-lang/noir_js 1.0.0-beta.9 + @aztec/bb.js 0.87.0
 */

import './worker-globals';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js/dest/browser/index.js';

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

export interface ProveMessage {
  type: 'PROVE';
  circuit: any;
  input: SwapProverInput;
}

export type ProverWorkerMessage =
  | { type: 'loading' }
  | { type: 'computing' }
  | { type: 'proving' }
  | { type: 'done'; proof: Uint8Array; publicInputs: string[] }
  | { type: 'error'; error: string };

self.onmessage = async (event: MessageEvent<ProveMessage>) => {
  const msg = event.data;

  if (msg.type !== 'PROVE') return;

  const { circuit, input } = msg;
  let backend: UltraHonkBackend | null = null;

  try {
    (self as any).postMessage({ type: 'loading' } as ProverWorkerMessage);
    backend = new UltraHonkBackend(circuit.bytecode);
    const noir = new Noir(circuit);

    (self as any).postMessage({ type: 'computing' } as ProverWorkerMessage);
    
    const witnessMap = {
      deposit_amount:    input.deposit_amount,
      withdrawal_amount: input.withdrawal_amount,
      secret:            input.secret,
      asset_in:          input.asset_in,
      asset_out:         input.asset_out,
      path_elements:     input.path_elements,
      path_indices:      input.path_indices.map(x => x.toString()),
      exchange_rate:     input.exchange_rate,
      rate_denominator:  input.rate_denominator,
      nullifier_hash:    input.nullifier_hash,
      asset_out_public:  input.asset_out_public,
      merkle_root:       input.merkle_root,
    };

    const { witness } = await noir.execute(witnessMap);

    (self as any).postMessage({ type: 'proving' } as ProverWorkerMessage);
    const { proof, publicInputs } = await backend.generateProof(witness);

    const formattedPublicInputs = Array.isArray(publicInputs)
      ? publicInputs.map((p) => {
          if (typeof p === 'string') return p;
          return Array.from(p as Uint8Array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        })
      : [];

    (self as any).postMessage(
      {
        type: 'done',
        proof,
        publicInputs: formattedPublicInputs,
      } as ProverWorkerMessage,
      [proof.buffer]
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    (self as any).postMessage({ type: 'error', error: errorMsg } as ProverWorkerMessage);
  } finally {
    if (backend) {
      try {
        await backend.destroy();
      } catch (destroyErr) {
        console.error('Failed to destroy barretenberg backend:', destroyErr);
      }
    }
  }
};
