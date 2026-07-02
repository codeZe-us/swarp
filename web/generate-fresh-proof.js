const fs = require('fs');
const { Noir } = require('@noir-lang/noir_js');
const { UltraHonkBackend } = require('@aztec/bb.js');

async function main() {
    const circuitPath = 'C:/projetcs/swarp/circuits/target/swap.json';
    const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir = new Noir(circuit);

    const { poseidon2Hash } = require('@zkpassport/poseidon2');
    const secret = 123n;
    const amount = 1000n;
    const assetId = 0n;
    const commitment = poseidon2Hash([amount, assetId, secret]);
    const nullifier = poseidon2Hash([commitment, secret]);

    const zeros = new Array(21);
    zeros[0] = poseidon2Hash([0n]);
    for(let i=1; i<=20; i++) zeros[i] = poseidon2Hash([zeros[i-1], zeros[i-1]]);

    const pathElements = new Array(20);
    const pathIndices = new Array(20).fill("0");
    let current = commitment;
    for(let i=0; i<20; i++) {
        pathElements[i] = zeros[i].toString();
        current = poseidon2Hash([current, zeros[i]]);
    }
    const root = current;

    const witnessMap = {
        deposit_amount: amount.toString(),
        withdrawal_amount: amount.toString(),
        secret: secret.toString(),
        asset_in: assetId.toString(),
        asset_out: "1",
        path_elements: pathElements,
        path_indices: pathIndices,
        exchange_rate: "1000",
        rate_denominator: "1000",
        nullifier_hash: nullifier.toString(),
        asset_out_public: "1",
        merkle_root: root.toString(),
    };

    console.log("Executing Noir...");
    const { witness } = await noir.execute(witnessMap);
    
    console.log("Generating proof...");
    const { proof, publicInputs } = await backend.generateProof(witness, { keccak: true });

    console.log("Proof generated!");
    
    console.log("publicInputs array:", publicInputs);

    // Convert to hex
    const proofHex = Buffer.from(proof).toString('hex');
    
    const valid = await backend.verifyProof({ proof, publicInputs }, { keccak: true });
    console.log("Local bb.js Verify Result:", valid);

    const vkBytes = await backend.getVerificationKey({ keccak: true });
    fs.writeFileSync('../contracts/ultrahonk-verifier-multi/vk_keccak', Buffer.from(vkBytes));
    console.log("Exported VK Keccak!");

    const piHex = publicInputs.map(p => {
        if (typeof p === 'string') return p.replace('0x', '').padStart(64, '0');
        return Array.from(p).map(b => b.toString(16).padStart(2, '0')).join('');
    }).join('');

    fs.writeFileSync('fresh_proof.json', JSON.stringify(proofHex));
    fs.writeFileSync('fresh_pi.json', JSON.stringify(piHex));
    
    console.log(`Proof Hex Length: ${proofHex.length}`);
    console.log(`PI Hex Length: ${piHex.length}`);
    
    await backend.destroy();
}

main().catch(console.error);
