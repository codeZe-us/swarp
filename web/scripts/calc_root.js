const { poseidon2Hash } = require('@zkpassport/poseidon2');

function poseidon_5(a, b, c, d, e) {
    const h1 = poseidon2Hash([a, b]);
    const h2 = poseidon2Hash([h1, c]);
    const h3 = poseidon2Hash([h2, d]);
    return poseidon2Hash([h3, e]);
}

function merkle_hash(left, right) {
    return poseidon2Hash([left, right]);
}

const user_address_hash = 123n;
const credential_type = 0n;
const expiry_timestamp = 2000000000n;
const issuer_id = 456n;
const secret = 789n;

const commitment = poseidon_5(user_address_hash, credential_type, expiry_timestamp, issuer_id, secret);

let current_hash = commitment;
for (let i = 0; i < 20; i++) {
    const left = current_hash;
    const right = 0n;
    current_hash = merkle_hash(left, right);
}

console.log("CREDENTIALS ROOT:");
console.log(current_hash.toString());
