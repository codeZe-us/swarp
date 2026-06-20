/**
 * web/lib/proof-formatter.ts
 *
 * Formats proof and public inputs from Barretenberg WASM into the format
 * expected by the ZendSwap UltraHonk verifier contract on Stellar.
 */

/**
 * Converts a field element string (decimal or hex) to a 32-byte big-endian hex string.
 *
 * @param field The field element as a string.
 * @returns A 64-character (32-byte) hex string.
 */
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

/**
 * Formats a raw Barretenberg proof Uint8Array and its public inputs.
 * Slices off any prepended public inputs from the proof to match the contract's
 * strict 14592-byte limit.
 *
 * @param proof The generated proof Uint8Array from Barretenberg.
 * @param publicInputs The public inputs array of field element strings.
 * @returns Hex-encoded proof and formatted public inputs.
 */
export function formatProofForContract(
  proof: Uint8Array,
  publicInputs: string[]
): { proofHex: string; publicInputsHex: string[] } {
  const EXPECTED_PROOF_LEN = 14592;

  let rawProof = proof;
  if (proof.length > EXPECTED_PROOF_LEN) {
    // Slices off any prepended public inputs (e.g. 5 public inputs * 32 bytes = 160 bytes)
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
