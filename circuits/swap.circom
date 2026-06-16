pragma circom 2.0.0;

include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template Swap() {
    // Private inputs
    signal input depositAmount;
    signal input withdrawalAmount;

    // Public inputs
    signal input exchangeRate;
    signal input rateDenominator;

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

    // 4. Both amounts must be strictly greater than zero (and since they are limited to 64 bits, checking that they are non-zero is sufficient to show > 0)
    component depositNonZero = IsZero();
    depositNonZero.in <== depositAmount;
    depositNonZero.out === 0;

    component withdrawalNonZero = IsZero();
    withdrawalNonZero.in <== withdrawalAmount;
    withdrawalNonZero.out === 0;
}

component main {public [exchangeRate, rateDenominator]} = Swap();
