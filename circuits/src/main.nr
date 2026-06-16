fn poseidon2_2(input: [Field; 2]) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = 2 * two_pow_64;
    let state = [input[0], input[1], 0, iv];
    let permuted = std::hash::poseidon2_permutation(state, 4);
    permuted[0]
}

fn poseidon2_3(input: [Field; 3]) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = 3 * two_pow_64;
    let state = [input[0], input[1], input[2], iv];
    let permuted = std::hash::poseidon2_permutation(state, 4);
    permuted[0]
}

fn assert_u64(x: Field) {
    let _bits: [u1; 64] = x.to_le_bits();
}

fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_2([left, right])
}

fn main(
    deposit_amount: Field,
    withdrawal_amount: Field,
    secret: Field,
    asset_in: Field,
    asset_out: Field,
    path_elements: [Field; 20],
    path_indices: [u1; 20],

    exchange_rate: pub Field,
    rate_denominator: pub Field,
    nullifier_hash: pub Field,
    asset_out_public: pub Field,
    merkle_root: pub Field,
) {
    let deposit_product = deposit_amount * exchange_rate;
    let withdrawal_product = withdrawal_amount * rate_denominator;
    assert(
        deposit_product == withdrawal_product,
        "conservation: withdrawal*rate_denom != deposit*rate"
    );

    assert_u64(deposit_amount);
    assert_u64(withdrawal_amount);

    assert(deposit_amount != 0, "deposit_amount must be > 0");
    assert(withdrawal_amount != 0, "withdrawal_amount must be > 0");

    let ai_check = asset_in * (1 - asset_in);
    assert(ai_check == 0, "asset_in must be binary (0 or 1)");

    assert(asset_out == asset_out_public, "asset_out != asset_out_public");

    let asset_sum = asset_in + asset_out;
    assert(asset_sum == 1, "asset_in + asset_out must equal 1 (no same-asset swaps)");

    let commitment = poseidon2_3([deposit_amount, asset_in, secret]);

    let computed_nullifier = poseidon2_2([commitment, secret]);
    assert(
        computed_nullifier == nullifier_hash,
        "nullifier does not match public nullifier_hash"
    );

    let mut current_hash = commitment;

    for i in 0..20 {
        let sibling = path_elements[i];
        let direction = path_indices[i];

        let dir_field = direction as Field;
        let left = current_hash * (1 - dir_field) + sibling * dir_field;
        let right = sibling * (1 - dir_field) + current_hash * dir_field;

        current_hash = merkle_hash(left, right);
    }

    assert(current_hash == merkle_root, "computed Merkle root != public merkle_root");
}

#[test]
fn test_poseidon2_parity() {
    let res_2 = poseidon2_2([1, 2]);
    assert(res_2 == 0x038682aa1cb5ae4e0a3f13da432a95c77c5c111f6f030faf9cad641ce1ed7383);

    let res_3 = poseidon2_3([1, 2, 3]);
    assert(res_3 == 0x23864adb160dddf590f1d3303683ebcb914f828e2635f6e85a32f0a1aecd3dd8);
}
