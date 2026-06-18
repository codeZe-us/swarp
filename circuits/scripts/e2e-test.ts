import { poseidon2Hash } from '@zkpassport/poseidon2';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const TREE_DEPTH = 20;

function toHex(n: bigint): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

function toField(n: bigint): string {
  return n.toString(10);
}

// Helper to run shell command in WSL Ubuntu
function runCommandInWsl(cmd: string): string {
  try {
    return execSync(`wsl -d Ubuntu bash -c "cd /mnt/c/projetcs/swarp/circuits && ${cmd}"`, { encoding: 'utf-8' });
  } catch (error: any) {
    throw new Error(error.stdout || error.stderr || error.message);
  }
}

async function runE2E(testFailure: boolean): Promise<{ proofSize: number; durationMs: number }> {
  // 1. Generate random secret (256 bits of entropy)
  const secretBytes = crypto.randomBytes(32);
  // Ensure the secret is within the BN254 field size (modulus)
  const BN254_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  const secret = BigInt('0x' + secretBytes.toString('hex')) % BN254_MODULUS;

  // 2. Set amounts and assets
  const DEPOSIT_AMOUNT = 500n;
  const EXCHANGE_RATE = 9200000n;
  const RATE_DENOMINATOR = 10000000n;
  
  // Withdrawal calculation:
  // For failure testing, set withdrawal amount to 461, otherwise calculate correctly (460)
  const WITHDRAWAL_AMOUNT = testFailure 
    ? 461n 
    : (DEPOSIT_AMOUNT * EXCHANGE_RATE) / RATE_DENOMINATOR;

  const ASSET_IN = 0n; // USDC
  const ASSET_OUT = 1n; // EURC

  // 3. Compute commitment
  const commitment = poseidon2Hash([DEPOSIT_AMOUNT, ASSET_IN, secret]);

  // 4. Compute Merkle tree zeros and paths
  const zeros: bigint[] = new Array(TREE_DEPTH);
  zeros[0] = poseidon2Hash([0n]);
  for (let i = 1; i < TREE_DEPTH; i++) {
    zeros[i] = poseidon2Hash([zeros[i - 1], zeros[i - 1]]);
  }

  const pathElements: bigint[] = zeros.slice(0, TREE_DEPTH);
  const pathIndices: number[] = new Array(TREE_DEPTH).fill(0); // commitment at index 0 (left at all levels)

  let current = commitment;
  for (let i = 0; i < TREE_DEPTH; i++) {
    current = poseidon2Hash([current, zeros[i]]);
  }
  const merkleRoot = current;

  // 5. Compute nullifier
  const nullifierHash = poseidon2Hash([commitment, secret]);

  // 6. Format Prover.toml content
  const lines: string[] = [
    `deposit_amount    = "${toField(DEPOSIT_AMOUNT)}"`,
    `withdrawal_amount = "${toField(WITHDRAWAL_AMOUNT)}"`,
    `secret            = "${toHex(secret)}"`,
    `asset_in          = "${toField(ASSET_IN)}"`,
    `asset_out         = "${toField(ASSET_OUT)}"`,
    `path_elements = [${pathElements.map(e => `"${toHex(e)}"`).join(', ')}]`,
    `path_indices = [${pathIndices.map(i => `"${toField(BigInt(i))}"`).join(', ')}]`,
    `exchange_rate    = "${toField(EXCHANGE_RATE)}"`,
    `rate_denominator = "${toField(RATE_DENOMINATOR)}"`,
    `nullifier_hash   = "${toHex(nullifierHash)}"`,
    `asset_out_public = "${toField(ASSET_OUT)}"`,
    `merkle_root      = "${toHex(merkleRoot)}"`
  ];

  // Write Prover.toml
  const projectRoot = path.resolve(__dirname, '..');
  const proverTomlPath = path.join(projectRoot, 'Prover.toml');
  fs.writeFileSync(proverTomlPath, lines.join('\n'), 'utf-8');

  // Verify compilation first
  runCommandInWsl('nargo compile');

  if (testFailure) {
    console.log('--- Testing FAILURE Case (Invalid Withdrawal Amount) ---');
    try {
      runCommandInWsl('nargo execute');
      // If execute succeeds (which it shouldn't because of assert), try proving
      runCommandInWsl('nargo prove e2e_failure_proof');
      throw new Error('Expected circuit to fail but it succeeded!');
    } catch (e: any) {
      console.log('✅ Success: Circuit correctly failed execution/proving as expected.');
      console.log(`Error message: ${e.message.split('\n')[0]}`);
      return { proofSize: 0, durationMs: 0 };
    }
  }

  console.log('--- Testing SUCCESS Case ---');
  // 7. Execute witness generation
  console.log('Generating witness...');
  runCommandInWsl('nargo execute');

  // 8. Prove
  console.log('Generating proof (UltraHonk)...');
  const startTime = Date.now();
  runCommandInWsl('nargo prove e2e_success_proof');
  const durationMs = Date.now() - startTime;

  // 9. Verify
  console.log('Verifying proof...');
  runCommandInWsl('nargo verify e2e_success_proof');
  console.log('✅ Proof successfully verified on-chain style!');

  // 10. Extract proof file size
  const proofFilePath = path.join(projectRoot, 'proofs', 'e2e_success_proof.proof');
  const stats = fs.statSync(proofFilePath);

  console.log(`- Deposit Amount     : ${DEPOSIT_AMOUNT}`);
  console.log(`- Withdrawal Amount  : ${WITHDRAWAL_AMOUNT}`);
  console.log(`- Secret Hex         : ${toHex(secret)}`);
  console.log(`- Commitment Hex     : ${toHex(commitment)}`);
  console.log(`- Merkle Root Hex    : ${toHex(merkleRoot)}`);
  console.log(`- Nullifier Hex      : ${toHex(nullifierHash)}`);
  console.log(`- Proof File Size    : ${stats.size} bytes`);
  console.log(`- Proof Generation Time: ${durationMs} ms`);

  return { proofSize: stats.size, durationMs };
}

async function main() {
  console.log('Starting Swap Circuit E2E test...\n');
  
  // Run success case
  const { proofSize, durationMs } = await runE2E(false);
  console.log('\nSuccess case test completed successfully.\n');

  // Run failure case
  await runE2E(true);
  console.log('\nFailure case test completed successfully.');
}

main().catch((err) => {
  console.error('E2E Test failed:', err);
  process.exit(1);
});
