const fs = require('fs');
const vk = fs.readFileSync('vk');
// The number of public inputs is 6.
// In rs-soroban-ultrahonk, expected = vk.public_inputs_size - 4.
// So vk.public_inputs_size must be 10.
vk.writeUInt32BE(10, 8);
fs.writeFileSync('vk', vk);
console.log("Patched vk with public_inputs_size = 10");
