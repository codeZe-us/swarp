const fs = require('fs');
const pi = require('../../web/public_inputs.json');
const rustCode = pi.map((x, i) => {
    const bytes = x.match(/.{1,2}/g).map(y => '0x' + y).join(', ');
    return `        let pi_${i}: [u8; 32] = [\n            ${bytes}\n        ];\n        public_inputs.push_back(BytesN::from_array(&env, &pi_${i}));`;
}).join('\n\n');
fs.writeFileSync('pi_test.rs.txt', rustCode);
console.log("Wrote pi_test.rs.txt");
