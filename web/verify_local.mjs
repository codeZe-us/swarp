import fs from 'fs';
import { UltraHonkBackend } from '@aztec/bb.js';

async function main() {
    const circuitStr = fs.readFileSync('../circuits/target/swap.json', 'utf-8');
    const circuit = JSON.parse(circuitStr);
    const backend = new UltraHonkBackend(circuit.bytecode);
    
    const proof = fs.readFileSync('proof.bin');
    
    // We don't have the original publicInputs object here easily, but bb.js verifier verifies the proof.
    // wait, backend.verifyProof expects an object with { proof, publicInputs }?
    // Let's just generate it again.
    
    const deposit_amount = 150000000n;
    const withdrawal_amount = 138000000n;
    const secret = 0x0e5a7bda2a951134c3c6dfa90301a630e6ba33adc72d560df69b26bb9c428ea8n;
    const asset_in = 4n;
    const asset_out = 2n;

    const { poseidon2Hash } = await import('@zkpassport/poseidon2');
    const commitment = poseidon2Hash([deposit_amount, asset_in, secret]);
    const nullifier_hash = poseidon2Hash([commitment, secret]);

    const path_elements = new Array(20).fill(0n);
    const path_indices = new Array(20).fill(0n);
    
    let current_hash = commitment;
    for (let i = 0; i < 20; i++) {
        current_hash = poseidon2Hash([current_hash, path_elements[i]]);
    }
    const merkle_root = current_hash;

    const witnessMap = {
        deposit_amount: deposit_amount.toString(),
        withdrawal_amount: withdrawal_amount.toString(),
        secret: "0x" + secret.toString(16),
        asset_in: asset_in.toString(),
        asset_out: asset_out.toString(),
        path_elements: path_elements.map(x => "0x" + x.toString(16)),
        path_indices: path_indices.map(x => x.toString()),
        exchange_rate: "9200000",
        rate_denominator: "10000000",
        nullifier_hash: "0x" + nullifier_hash.toString(16),
        asset_out_public: asset_out.toString(),
        merkle_root: "0x" + merkle_root.toString(16)
    };

    const { Noir } = await import('@noir-lang/noir_js');
    const noir = new Noir(circuit);
    const { witness } = await noir.execute(witnessMap);
    
    const proofData = await backend.generateProof(witness);
    
    const isValid = await backend.verifyProof(proofData);
    console.log("Local verification:", isValid);
    await backend.destroy();
}
main().catch(console.error);
