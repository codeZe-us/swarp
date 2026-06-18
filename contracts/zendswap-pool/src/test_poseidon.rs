#![cfg(test)]
use soroban_sdk::{
    crypto::bn254::Bn254Fr,
    vec,
    Bytes,
    Env,
    U256,
};
use soroban_poseidon::poseidon_hash;

// Helper function to create U256 from a 32-byte array representing big-endian bytes
fn u256_from_bytes(env: &Env, bytes_arr: [u8; 32]) -> U256 {
    let bytes = Bytes::from_array(env, &bytes_arr);
    U256::from_be_bytes(env, &bytes)
}

#[test]
fn test_poseidon_parity() {
    let env = Env::default();

    // 1. Single Input: [1]
    let in_1 = vec![&env, U256::from_u32(&env, 1)];
    // T = 2, representing (rate = 1, capacity = 1)
    let res_1 = poseidon_hash::<2, Bn254Fr>(&env, &in_1);
    
    // Expected output from JS: 0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133
    let expected_1 = u256_from_bytes(&env, [
        0x29, 0x17, 0x61, 0x00, 0xea, 0xa9, 0x62, 0xbd, 
        0xc1, 0xfe, 0x6c, 0x65, 0x4d, 0x6a, 0x3c, 0x13, 
        0x0e, 0x96, 0xa4, 0xd1, 0x16, 0x8b, 0x33, 0x84, 
        0x8b, 0x89, 0x7d, 0xc5, 0x02, 0x82, 0x01, 0x33
    ]);
    assert_eq!(res_1, expected_1, "Single input hash mismatch");

    // 2. Two Inputs: [1, 2]
    let in_2 = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
    ];
    // T = 3, representing (rate = 2, capacity = 1)
    let res_2 = poseidon_hash::<3, Bn254Fr>(&env, &in_2);
    
    // Expected output from JS: 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a
    let expected_2 = u256_from_bytes(&env, [
        0x11, 0x5c, 0xc0, 0xf5, 0xe7, 0xd6, 0x90, 0x41, 
        0x3d, 0xf6, 0x4c, 0x6b, 0x96, 0x62, 0xe9, 0xcf, 
        0x2a, 0x36, 0x17, 0xf2, 0x74, 0x32, 0x45, 0x51, 
        0x9e, 0x19, 0x60, 0x7a, 0x44, 0x17, 0x18, 0x9a
    ]);
    assert_eq!(res_2, expected_2, "Two inputs hash mismatch");

    // 3. Three Inputs: [1, 2, 3]
    let in_3 = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
        U256::from_u32(&env, 3),
    ];
    // T = 4, representing (rate = 3, capacity = 1)
    let res_3 = poseidon_hash::<4, Bn254Fr>(&env, &in_3);

    // Expected output from JS: 0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732
    let expected_3 = u256_from_bytes(&env, [
        0x0e, 0x77, 0x32, 0xd8, 0x9e, 0x69, 0x39, 0xc0, 
        0xff, 0x03, 0xd5, 0xe5, 0x8d, 0xab, 0x63, 0x02, 
        0xf3, 0x23, 0x0e, 0x26, 0x9d, 0xc5, 0xb9, 0x68, 
        0xf7, 0x25, 0xdf, 0x34, 0xab, 0x36, 0xd7, 0x32
    ]);
    assert_eq!(res_3, expected_3, "Three inputs hash mismatch");

    // 4. Four Inputs: [1, 2, 3, 4]
    let in_4 = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
        U256::from_u32(&env, 3),
        U256::from_u32(&env, 4),
    ];
    // T = 5, representing (rate = 4, capacity = 1)
    let res_4 = poseidon_hash::<5, Bn254Fr>(&env, &in_4);

    // Expected output from JS: 0x299c867db6c1fdd79dcefa40e4510b9837e60ebb1ce0663dbaa525df65250465
    let expected_4 = u256_from_bytes(&env, [
        0x29, 0x9c, 0x86, 0x7d, 0xb6, 0xc1, 0xfd, 0xd7, 
        0x9d, 0xce, 0xfa, 0x40, 0xe4, 0x51, 0x0b, 0x98, 
        0x37, 0xe6, 0x0e, 0xbb, 0x1c, 0xe0, 0x66, 0x3d, 
        0xba, 0xa5, 0x25, 0xdf, 0x65, 0x25, 0x04, 0x65
    ]);
    assert_eq!(res_4, expected_4, "Four inputs hash mismatch");

    // 5. Edge Case: Zero
    let in_zero = vec![&env, U256::from_u32(&env, 0)];
    let res_zero = poseidon_hash::<2, Bn254Fr>(&env, &in_zero);

    // Expected output from JS: 0x2a09a9fd93c590c26b91effbb2499f07e8f7aa12e2b4940a3aed2411cb65e11c
    let expected_zero = u256_from_bytes(&env, [
        0x2a, 0x09, 0xa9, 0xfd, 0x93, 0xc5, 0x90, 0xc2, 
        0x6b, 0x91, 0xef, 0xfb, 0xb2, 0x49, 0x9f, 0x07, 
        0xe8, 0xf7, 0xaa, 0x12, 0xe2, 0xb4, 0x94, 0x0a, 
        0x3a, 0xed, 0x24, 0x11, 0xcb, 0x65, 0xe1, 0x1c
    ]);
    assert_eq!(res_zero, expected_zero, "Zero input hash mismatch");

    // 6. Edge Case: One
    let in_one = vec![&env, U256::from_u32(&env, 1)];
    let res_one = poseidon_hash::<2, Bn254Fr>(&env, &in_one);
    assert_eq!(res_one, expected_1, "One input hash mismatch");

    // 7. Edge Case: Max 64-bit BigInt: [18446744073709551615] (0xffffffffffffffff)
    let in_max_64 = vec![&env, U256::from_u128(&env, 18446744073709551615)];
    let res_max_64 = poseidon_hash::<2, Bn254Fr>(&env, &in_max_64);

    // Expected output from JS: 0x2693f54c370d174aae1942f40015c61862f0ed7022bcb6dd59ccc70d631f9055
    let expected_max_64 = u256_from_bytes(&env, [
        0x26, 0x93, 0xf5, 0x4c, 0x37, 0x0d, 0x17, 0x4a, 
        0xae, 0x19, 0x42, 0xf4, 0x00, 0x15, 0xc6, 0x18, 
        0x62, 0xf0, 0xed, 0x70, 0x22, 0xbc, 0xb6, 0xdd, 
        0x59, 0xcc, 0xc7, 0x0d, 0x63, 0x1f, 0x90, 0x55
    ]);
    assert_eq!(res_max_64, expected_max_64, "Max 64-bit input hash mismatch");
}

#[test]
fn test_poseidon2_parity() {
    let env = Env::default();
    use soroban_poseidon::poseidon2_hash;

    // Test poseidon2_2([1, 2])
    let in_2 = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
    ];
    let res_2 = poseidon2_hash::<4, Bn254Fr>(&env, &in_2);
    let expected_2 = u256_from_bytes(&env, [
        0x03, 0x86, 0x82, 0xaa, 0x1c, 0xb5, 0xae, 0x4e,
        0x0a, 0x3f, 0x13, 0xda, 0x43, 0x2a, 0x95, 0xc7,
        0x7c, 0x5c, 0x11, 0x1f, 0x6f, 0x03, 0x0f, 0xaf,
        0x9c, 0xad, 0x64, 0x1c, 0xe1, 0xed, 0x73, 0x83,
    ]);
    assert_eq!(res_2, expected_2, "poseidon2_2 mismatch");

    // Test poseidon2_3([1, 2, 3])
    let in_3 = vec![
        &env,
        U256::from_u32(&env, 1),
        U256::from_u32(&env, 2),
        U256::from_u32(&env, 3),
    ];
    let res_3 = poseidon2_hash::<4, Bn254Fr>(&env, &in_3);
    let expected_3 = u256_from_bytes(&env, [
        0x23, 0x86, 0x4a, 0xdb, 0x16, 0x0d, 0xdd, 0xf5,
        0x90, 0xf1, 0xd3, 0x30, 0x36, 0x83, 0xeb, 0xcb,
        0x91, 0x4f, 0x82, 0x8e, 0x26, 0x35, 0xf6, 0xe8,
        0x5a, 0x32, 0xf0, 0xa1, 0xae, 0xcd, 0x3d, 0xd8,
    ]);
    assert_eq!(res_3, expected_3, "poseidon2_3 mismatch");
}