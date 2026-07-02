import fs from 'fs';
import { UltraHonkBackend } from '@aztec/bb.js';

async function main() {
    const circuitStr = fs.readFileSync('../circuits/target/swap.json', 'utf-8');
    const circuit = JSON.parse(circuitStr);
    const backend = new UltraHonkBackend(circuit.bytecode);
    
    // Extract VK
    const vk = await backend.getVerificationKey();
    
    fs.writeFileSync('../contracts/ultrahonk-verifier/vk_new', vk);
    console.log("VK extracted to vk_new. Size:", vk.length);
    await backend.destroy();
}
main().catch(console.error);
