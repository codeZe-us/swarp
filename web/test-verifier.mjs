import fs from 'fs';
import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { poseidon2Hash } from '@zkpassport/poseidon2';

async function main() {
    const circuitStr = fs.readFileSync('../circuits/target/swap.json', 'utf-8');
    const circuit = JSON.parse(circuitStr);

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir = new Noir(circuit);

    const deposit_amount = 150000000n;
    const withdrawal_amount = 138000000n;
    const secret = 0x0e5a7bda2a951134c3c6dfa90301a630e6ba33adc72d560df69b26bb9c428ea8n;
    const asset_in = 4n;
    const asset_out = 2n;

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

    console.log("Executing witness...");
    const { witness } = await noir.execute(witnessMap);

    console.log("Generating proof...");
    const { proof, publicInputs } = await backend.generateProof(witness);

    const formattedPublicInputs = Array.isArray(publicInputs)
        ? publicInputs.map(p => {
            if (typeof p === 'string') {
                return p.startsWith('0x') ? p.slice(2) : p;
            }
            return Array.from(p).map(b => b.toString(16).padStart(2, '0')).join('');
        })
        : [];
        
    fs.writeFileSync('proof.bin', proof);
    fs.writeFileSync('public_inputs.json', JSON.stringify(formattedPublicInputs));
    console.log("Proof saved to proof.bin!");

    console.log("Verifying proof with bb.js...");
    const isValid = await backend.verifyProof({ proof, publicInputs });
    console.log("bb.js verifyProof returned:", isValid);

    await backend.destroy();
}

main().catch(console.error);
