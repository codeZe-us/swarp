/**
 * web/workers/prover.worker.ts
 *
 * Browser Web Worker: ZendSwap UltraHonk prover.
 *
 * ALL Noir/BB.js imports are DYNAMIC (inside onmessage) — NOT static imports
 * at the top. Static imports get bundled by Webpack which corrupts the CJS
 * module environment. Dynamic imports run at runtime inside the worker scope,
 * bypassing Webpack's module wrapping entirely.
 */

export interface SwapProverInput {
  deposit_amount:    string;
  withdrawal_amount: string;
  secret:            string;
  asset_in:          string;
  asset_out:         string;
  path_elements:     string[];
  path_indices:      number[];
  exchange_rate:     string;
  rate_denominator:  string;
  nullifier_hash:    string;
  asset_out_public:  string;
  merkle_root:       string;
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

self.onmessage = async (event: MessageEvent<ProverWorkerMessage>) => {
  const msg = event.data;
  if (!msg || (msg as any).type !== 'PROVE') return;

  const { circuit, input } = (msg as any);

  console.log('Worker received inputs:', JSON.stringify(input, null, 2));

  try {
    // ----------------------------------------------------------------
    // DYNAMIC IMPORTS — must stay inside onmessage, not at module top!
    // Static imports are bundled by Webpack which breaks CJS init.
    // Dynamic imports run at runtime in the worker scope, bypassing it.
    // ----------------------------------------------------------------
    (self as any).postMessage({ type: 'loading' } as ProverWorkerMessage);

    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import('@noir-lang/noir_js'),
      import('@aztec/bb.js'),
    ]);

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir = new Noir(circuit);

    (self as any).postMessage({ type: 'computing' } as ProverWorkerMessage);

    const witnessMap = {
      deposit_amount:    input.deposit_amount,
      withdrawal_amount: input.withdrawal_amount,
      secret:            input.secret,
      asset_in:          input.asset_in,
      asset_out:         input.asset_out,
      path_elements:     input.path_elements,
      path_indices:      input.path_indices.map((x: number) => x.toString()),
      exchange_rate:     input.exchange_rate,
      rate_denominator:  input.rate_denominator,
      nullifier_hash:    input.nullifier_hash,
      asset_out_public:  input.asset_out_public,
      merkle_root:       input.merkle_root,
    };

    console.log('=== CIRCUIT INPUTS ===');
    console.log(JSON.stringify(witnessMap, null, 2));
    console.log('======================');

    const { witness } = await noir.execute(witnessMap);

    (self as any).postMessage({ type: 'proving' } as ProverWorkerMessage);
    const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });

    const formattedPublicInputs = Array.isArray(publicInputs)
      ? publicInputs.map((p) => {
          if (typeof p === 'string') return p;
          return Array.from(p as Uint8Array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        })
      : [];

    (self as any).postMessage(
      { type: 'done', proof, publicInputs: formattedPublicInputs } as ProverWorkerMessage,
      [proof.buffer]
    );

    await backend.destroy();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.stack : String(err);
    (self as any).postMessage({ type: 'error', error: errorMsg } as ProverWorkerMessage);
  }
};
