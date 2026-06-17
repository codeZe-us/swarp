# Poseidon Hash Parity Verification

This document details the verification process and test vectors used to ensure that the client-side Poseidon hash implementation (using `circomlibjs`) and the on-chain Soroban contract Poseidon hash implementation (using `soroban-poseidon`) produce identical outputs over the BN254 scalar field.

> [!IMPORTANT]
> **Prerequisite:** This parity test **must pass** before proceeding with any other ZK circuit or contract development. Any discrepancy between client-side and on-chain hashing will cause ZK proof verification to fail.

---

## Test Vectors and Expected Outputs

The following inputs are hashed using both implementations. The expected outputs (in hexadecimal and decimal) are listed below. All inputs and outputs are elements of the BN254 scalar field.

### 1. Single Input
*   **Input:** `[1]` (as `U256` / `BigInt`)
*   **Expected Hex:** `0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133`
*   **Expected Decimal:** `18586133768512220936620570745912940619677854269274689475585506675881198879027`

### 2. Two Inputs
*   **Input:** `[1, 2]`
*   **Expected Hex:** `0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a`
*   **Expected Decimal:** `7853200120776062878684798364095072458815029376092732009249414926327459813530`

### 3. Three Inputs
*   **Input:** `[1, 2, 3]`
*   **Expected Hex:** `0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732`
*   **Expected Decimal:** `6542985608222806190361240322586112750744169038454362455181422643027100751666`

### 4. Four Inputs
*   **Input:** `[1, 2, 3, 4]`
*   **Expected Hex:** `0x299c867db6c1fdd79dcefa40e4510b9837e60ebb1ce0663dbaa525df65250465`
*   **Expected Decimal:** `18821383157269793795438455681495246036402687001665670618754263018637548127333`

### 5. Edge Case: Zero
*   **Input:** `[0]`
*   **Expected Hex:** `0x2a09a9fd93c590c26b91effbb2499f07e8f7aa12e2b4940a3aed2411cb65e11c`
*   **Expected Decimal:** `19014214495641488759237505126948346942972912379615652741039992445865937985820`

### 6. Edge Case: Max 64-bit Integer
*   **Input:** `[18446744073709551615]` (or `0xffffffffffffffff`)
*   **Expected Hex:** `0x2693f54c370d174aae1942f40015c61862f0ed7022bcb6dd59ccc70d631f9055`
*   **Expected Decimal:** `17449307747295017006142981453320720946812828330895590310359634430146721583189`

---

## How to Run the Tests

### 1. Run the Client-Side (TypeScript) Test
First compile the typescript test file:
```bash
npx tsc circuits/scripts/test-poseidon-parity.ts --esModuleInterop --moduleResolution node --target es2022
```
Then execute using Node:
```bash
node circuits/scripts/test-poseidon-parity.js
```

### 2. Run the On-Chain (Rust) Test
Run the test within the contract package:
```bash
cargo test --package zendswap-pool --lib -- test_poseidon::test_poseidon_parity --nocapture
```

---

## Troubleshooting Discrepancies

If the outputs between the two implementations ever diverge, check the following potential causes:

1.  **Field Order (Modulus):**
    Ensure both implementations are using the BN254 scalar field curve. The modulus for BN254 (also known as alt_bn128) is:
    `21888242871839275222246405745257275088548364400416034343698204186575808495617`
    If a different field (like BLS12-381) is used, the hashes will not match.

2.  **Sponge Parameters ($t$, $rate$, $capacity$):**
    For an input vector of size $N$, both implementations must use a sponge size of $t = N + 1$.
    *   In `circomlibjs`, passing an array of size $N$ automatically initializes the correct $t$.
    *   In `soroban-poseidon`, you must specify $T$ as the first generic parameter: `poseidon_hash::<N + 1, Bn254Fr>(...)`.

3.  **Endianness and Serialization:**
    *   `circomlibjs` takes `BigInt` or `Uint8Array`.
    *   Soroban's `U256::from_be_bytes` expects big-endian bytes. Be sure the byte order matches exactly.

4.  **Sponge Padding/Capacity Initialization:**
    Be aware of padding rules when the input length is variable. To avoid collisions, ensure that inputs are correctly padded or that `Poseidon2` is used if variable-length inputs are necessary.
