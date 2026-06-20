import { SwapProverInput } from '../workers/prover.worker';

export type SwapProofInput = SwapProverInput;

export type ProverProgressCallback = (stage: 'loading' | 'computing' | 'proving') => void;

let isProving = false;

/**
 * Generates an UltraHonk proof using a background Web Worker.
 *
 * @param input The private and public inputs to the Noir circuit.
 * @param onProgress Callback invoked as the prover transitions between stages.
 * @returns Promise resolving to the generated proof and public inputs.
 */
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
    // 1. Fetch compiled circuit artifact from public assets
    const response = await fetch('/circuits/circuit.json');
    if (!response.ok) {
      throw new Error(`Failed to load circuit artifact: ${response.status} ${response.statusText}`);
    }
    const circuit = await response.json();

    // 2. Generate the proof via background Web Worker
    return await new Promise<{ proof: Uint8Array; publicInputs: string[] }>((resolve, reject) => {
      // Initialize the worker using Webpack/Next.js native worker import support
      worker = new Worker(new URL('../workers/prover.worker.ts', import.meta.url));

      // Setup timeout guard (120 seconds)
      timeoutId = setTimeout(() => {
        if (worker) {
          worker.terminate();
          worker = null;
        }
        reject(new Error('Proof generation timed out (120s limit exceeded)'));
      }, 120000);

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'loading':
          case 'computing':
          case 'proving':
            if (onProgress) {
              onProgress(msg.type);
            }
            break;
          case 'done':
            if (timeoutId) clearTimeout(timeoutId);
            if (worker) {
              worker.terminate();
              worker = null;
            }
            resolve({
              proof: msg.proof,
              publicInputs: msg.publicInputs,
            });
            break;
          case 'error':
            if (timeoutId) clearTimeout(timeoutId);
            if (worker) {
              worker.terminate();
              worker = null;
            }
            reject(new Error(msg.error));
            break;
          default:
            break;
        }
      };

      worker.onerror = (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (worker) {
          worker.terminate();
          worker = null;
        }
        reject(new Error(`Worker error: ${err.message || 'Unknown error'}`));
      };

      // Dispatch proving request to Web Worker
      worker.postMessage({
        type: 'PROVE',
        circuit,
        input,
      });
    });
  } finally {
    isProving = false;
  }
}
