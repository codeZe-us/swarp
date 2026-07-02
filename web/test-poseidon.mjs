import { poseidon2Hash } from '@zkpassport/poseidon2';

const amount = 150000000n;
const assetId = 2n;
const secretVal = BigInt("0x0e5a7bda2a951134c3c6dfa90301a630e6ba33adc72d560df69b26bb9c428ea8");

const commitment = poseidon2Hash([amount, assetId, secretVal]);
console.log("Commitment:", "0x" + commitment.toString(16));

const nullifier = poseidon2Hash([commitment, secretVal]);
console.log("Nullifier:", "0x" + nullifier.toString(16));
