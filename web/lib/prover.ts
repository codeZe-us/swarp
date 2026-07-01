/**
 * web/lib/prover.ts
 *
 * Main-thread orchestrator for ZK proof generation.
 * Loads the Web Worker from the public/ directory to bypass Next.js Webpack.
 */
import { SwapProverInput } from '../workers/prover.worker';

export type SwapProofInput = SwapProverInput;

export type ProverProgressCallback = (stage: 'loading' | 'computing' | 'proving') => void;

let isProving = false;

export async function generateSwapProof(
  input: SwapProofInput,
  onProgress?: ProverProgressCallback
): Promise<{ proof: Uint8Array; publicInputs: string[] }> {
  if (isProving) {
    throw new Error('Proof generation already in progress');
  }

  isProving = true;
  let worker: Worker | null = null;
  let timeoutId: any = null;

  try {
    const response = await fetch('/circuits/circuit.json');
    if (!response.ok) {
      throw new Error(`Failed to load circuit artifact: ${response.status} ${response.statusText}`);
    }
    const circuit = await response.json();

    return await new Promise<{ proof: Uint8Array; publicInputs: string[] }>((resolve, reject) => {
      // Load the pre-bundled worker from the public/ directory.
      // This bypasses Next.js Webpack entirely!
      worker = new Worker('/prover.worker.js', { type: 'module' });

      timeoutId = setTimeout(() => {
        if (worker) { worker.terminate(); worker = null; }
        reject(new Error('Proof generation timed out (120s limit exceeded)'));
      }, 120000);

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'loading':
          case 'computing':
          case 'proving':
            onProgress?.(msg.type);
            break;
          case 'done':
            if (timeoutId) clearTimeout(timeoutId);
            if (worker) { worker.terminate(); worker = null; }
            resolve({ proof: msg.proof, publicInputs: msg.publicInputs });
            break;
          case 'error':
            if (timeoutId) clearTimeout(timeoutId);
            if (worker) { worker.terminate(); worker = null; }
            reject(new Error(msg.error));
            break;
        }
      };

      worker.onerror = (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (worker) { worker.terminate(); worker = null; }
        reject(new Error(`Worker error: ${err.message || 'Unknown error'}`));
      };

      console.log('=== PROOF INPUTS ===');
      console.log(JSON.stringify(input, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2));
      console.log('====================');
      worker.postMessage({ type: 'PROVE', circuit, input });
    });
  } finally {
    isProving = false;
  }
}
