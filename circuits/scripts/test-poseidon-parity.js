// @ts-ignore
import { buildPoseidon } from 'circomlibjs';
async function run() {
    const poseidon = await buildPoseidon();
    const testVectors = [
        { name: "Single Input (1)", inputs: [1n] },
        { name: "Two Inputs (1, 2)", inputs: [1n, 2n] },
        { name: "Three Inputs (1, 2, 3)", inputs: [1n, 2n, 3n] },
        { name: "Four Inputs (1, 2, 3, 4)", inputs: [1n, 2n, 3n, 4n] },
        { name: "Edge Case: Zero", inputs: [0n] },
        { name: "Edge Case: One", inputs: [1n] },
        { name: "Edge Case: Max 64-bit", inputs: [18446744073709551615n] }
    ];
    console.log("=== Poseidon Hash Test Vectors (BN254 Field via circomlibjs) ===");
    for (const vec of testVectors) {
        const hashBytes = poseidon(vec.inputs);
        const decStr = poseidon.F.toString(hashBytes, 10);
        const hexStr = poseidon.F.toString(hashBytes, 16).padStart(64, '0');
        console.log(`\nVector: ${vec.name}`);
        console.log(`Inputs: [${vec.inputs.map(x => x.toString()).join(", ")}]`);
        console.log(`Decimal: ${decStr}`);
        console.log(`Hex:     0x${hexStr}`);
    }
}
run().catch(console.error);
