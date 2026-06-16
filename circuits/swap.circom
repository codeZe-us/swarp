pragma circom 2.0.0;

include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

template Swap() {
    // Private inputs
    signal input depositAmount;
    signal input withdrawalAmount;
    
    // Random blinding factor (Must be generated with at least 252 bits of entropy on client-side)
    signal input secret;
    
    // Asset type inputs (0 = USDC, 1 = EURC)
    signal input assetIn;
    signal input assetOut;

    // Public inputs
    signal input exchangeRate;
    signal input rateDenominator;
    signal input nullifierHash;
    signal input assetOutPublic;

    // 1. Conservation rule:
    // withdrawalAmount * rateDenominator === depositAmount * exchangeRate
    signal depositProduct;
    depositProduct <== depositAmount * exchangeRate;
    withdrawalAmount * rateDenominator === depositProduct;

    // 2. Range proof on depositAmount (must fit within 64 bits)
    component depositRangeCheck = Num2Bits(64);
    depositRangeCheck.in <== depositAmount;

    // 3. Range proof on withdrawalAmount (must fit within 64 bits)
    component withdrawalRangeCheck = Num2Bits(64);
    withdrawalRangeCheck.in <== withdrawalAmount;

    // 4. Both amounts must be strictly greater than zero (limited to 64 bits)
    component depositNonZero = IsZero();
    depositNonZero.in <== depositAmount;
    depositNonZero.out === 0;

    component withdrawalNonZero = IsZero();
    withdrawalNonZero.in <== withdrawalAmount;
    withdrawalNonZero.out === 0;

    // 5. Asset validity: assetIn must be binary (0 or 1)
    // Constrain: assetIn * (1 - assetIn) === 0
    assetIn * (1 - assetIn) === 0;

    // 6. Target asset matching: assert assetOut equals assetOutPublic
    assetOut === assetOutPublic;

    // 7. Non-identical swap (prevent swap USDC -> USDC, i.e., assetIn != assetOut)
    // Constrain: assetIn + assetOut === 1
    // (If assetIn is binary and assetIn + assetOut === 1, it automatically forces assetOut to be binary and assetIn != assetOut)
    assetIn + assetOut === 1;

    // 8. Commitment computation: Poseidon(depositAmount, assetIn, secret)
    component hasherCommitment = Poseidon(3);
    hasherCommitment.inputs[0] <== depositAmount;
    hasherCommitment.inputs[1] <== assetIn;
    hasherCommitment.inputs[2] <== secret;
    signal commitment;
    commitment <== hasherCommitment.out;

    // 9. Nullifier computation: Poseidon(commitment, secret)
    component hasherNullifier = Poseidon(2);
    hasherNullifier.inputs[0] <== commitment;
    hasherNullifier.inputs[1] <== secret;
    
    // Assert nullifier hash matches the public input nullifierHash
    nullifierHash === hasherNullifier.out;
}

component main {public [exchangeRate, rateDenominator, nullifierHash, assetOutPublic]} = Swap();

