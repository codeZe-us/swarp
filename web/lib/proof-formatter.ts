
export function formatFieldToBytes32(field: string): string {
  let value: bigint;
  try {
    if (field.startsWith('0x') || field.startsWith('0X')) {
      value = BigInt(field);
    } else {
      value = BigInt(field);
    }
  } catch (err) {
    throw new Error(`Failed to parse field element: ${field}. Error: ${err}`);
  }

  const hex = value.toString(16).padStart(64, '0');
  if (hex.length > 64) {
    throw new Error(`Field element overflows 32 bytes: ${field}`);
  }
  return hex;
}

export function formatProofForContract(
  proof: Uint8Array,
  publicInputs: string[]
): { proofHex: string; publicInputsHex: string[] } {
  const EXPECTED_PROOF_LEN = 14592;

  let rawProof = proof;
  if (proof.length > EXPECTED_PROOF_LEN) {
    const prependedLen = proof.length - EXPECTED_PROOF_LEN;
    rawProof = proof.slice(prependedLen);
    console.log(`Slicing off ${prependedLen} prepended bytes to yield raw ${EXPECTED_PROOF_LEN}-byte proof`);
  }

  if (rawProof.length !== EXPECTED_PROOF_LEN) {
    throw new Error(
      `Invalid proof length: expected ${EXPECTED_PROOF_LEN} bytes, got ${rawProof.length} bytes (original: ${proof.length} bytes)`
    );
  }

  const proofHex = Array.from(rawProof)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const publicInputsHex = publicInputs.map((pi) => formatFieldToBytes32(pi));

  return {
    proofHex,
    publicInputsHex,
  };
}
