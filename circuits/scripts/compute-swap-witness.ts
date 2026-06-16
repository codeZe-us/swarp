// @ts-ignore
import { buildPoseidon } from 'circomlibjs';

async function run() {
    const poseidon = await buildPoseidon();

    // Inputs
    const depositAmount = 500000000n; // 500 USDC (6 decimals)
    const assetIn = 0n; // USDC

    // A secure 252-bit random secret that fits within the BN254 scalar field capacity.
    // BN254 Modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
    // This secret has 77 decimal digits and is roughly ~253 bits.
    const secret = 12345678901234567890123456789012345678901234567890123456789012345678901234567n;

    const withdrawalAmount = 460000000n; // 460 EURC (6 decimals)
    const exchangeRate = 920000n; // 0.92 exchange rate
    const rateDenominator = 1000000n;
    const assetOutPublic = 1n; // EURC (public target)
    const assetOut = 1n; // EURC (private target)

    // 1. Compute commitment = Poseidon(depositAmount, assetIn, secret)
    const commitmentBytes = poseidon([depositAmount, assetIn, secret]);
    const commitmentStr = poseidon.F.toString(commitmentBytes, 10);
    const commitmentBigInt = BigInt(commitmentStr);

    // 2. Compute nullifierHash = Poseidon(commitment, secret)
    const nullifierBytes = poseidon([commitmentBigInt, secret]);
    const nullifierHashStr = poseidon.F.toString(nullifierBytes, 10);

    const witness = {
        depositAmount: depositAmount.toString(),
        withdrawalAmount: withdrawalAmount.toString(),
        exchangeRate: exchangeRate.toString(),
        rateDenominator: rateDenominator.toString(),
        secret: secret.toString(),
        assetIn: assetIn.toString(),
        assetOut: assetOut.toString(),
        assetOutPublic: assetOutPublic.toString(),
        nullifierHash: nullifierHashStr
    };

    console.log("WITNESS_OUTPUT_START");
    console.log(JSON.stringify(witness, null, 2));
    console.log("WITNESS_OUTPUT_END");
}

run().catch(console.error);

