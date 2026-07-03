export interface KycProverInput {
  user_address_hash: string;
  credential_type: string;
  expiry_timestamp: string;
  issuer_id: string;
  secret: string;
  path_elements: string[];
  path_indices: number[];
  credentials_root: string;
  current_timestamp: string;
  required_credential_type: string;
  required_issuer: string;
  user_address_public: string;
}

export interface ProveKycMessage {
  type: 'PROVE_KYC';
  circuit: any;
  input: KycProverInput;
}

export type ProverWorkerMessage =
  | { type: 'loading' }
  | { type: 'computing' }
  | { type: 'proving' }
  | { type: 'done'; proof: Uint8Array; publicInputs: string[] }
  | { type: 'error'; error: string };

self.onmessage = async (event: MessageEvent<ProverWorkerMessage>) => {
  const msg = event.data;
  if (!msg || (msg as any).type !== 'PROVE_KYC') return;

  const { circuit, input } = (msg as any);

  console.log('Worker received KYC inputs:', JSON.stringify(input, null, 2));

  try {
    (self as any).postMessage({ type: 'loading' } as ProverWorkerMessage);

    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import('@noir-lang/noir_js'),
      import('@aztec/bb.js'),
    ]);

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir = new Noir(circuit);

    (self as any).postMessage({ type: 'computing' } as ProverWorkerMessage);

    const witnessMap = {
      user_address_hash: input.user_address_hash,
      credential_type: input.credential_type,
      expiry_timestamp: input.expiry_timestamp,
      issuer_id: input.issuer_id,
      secret: input.secret,
      path_elements: input.path_elements,
      path_indices: input.path_indices.map((x: number) => x.toString()),
      credentials_root: input.credentials_root,
      current_timestamp: input.current_timestamp,
      required_credential_type: input.required_credential_type,
      required_issuer: input.required_issuer,
      user_address_public: input.user_address_public,
    };

    console.log('=== KYC CIRCUIT INPUTS ===');
    console.log(JSON.stringify(witnessMap, null, 2));
    console.log('==========================');

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
