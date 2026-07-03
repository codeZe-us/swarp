fn poseidon2_2(input: [Field; 2]) -> Field {
    let two_pow_64 = 18446744073709551616;
    let iv = 2 * two_pow_64;
    let state = [input[0], input[1], 0, iv];
    let permuted = std::hash::poseidon2_permutation(state, 4);
    permuted[0]
}

fn poseidon_5(a: Field, b: Field, c: Field, d: Field, e: Field) -> Field {
    let h1 = poseidon2_2([a, b]);
    let h2 = poseidon2_2([h1, c]);
    let h3 = poseidon2_2([h2, d]);
    poseidon2_2([h3, e])
}

fn assert_u64(x: Field) {
    let _bits: [u1; 64] = x.to_le_bits();
}

fn merkle_hash(left: Field, right: Field) -> Field {
    poseidon2_2([left, right])
}

fn main(
    user_address_hash: Field,
    credential_type: Field,
    expiry_timestamp: Field,
    issuer_id: Field,
    secret: Field,
    path_elements: [Field; 20],
    path_indices: [Field; 20],

    credentials_root: pub Field,
    current_timestamp: pub Field,
    required_credential_type: pub Field,
    required_issuer: pub Field,
    user_address_public: pub Field,
) {
    assert_u64(expiry_timestamp);
    assert_u64(current_timestamp);

    let expiry = expiry_timestamp as u64;
    let current = current_timestamp as u64;
    assert(expiry > current, "credential expired");

    assert(user_address_hash == user_address_public, "user address hash mismatch");
    assert(credential_type == required_credential_type, "credential type mismatch");
    assert(issuer_id == required_issuer, "issuer mismatch");

    let commitment = poseidon_5(user_address_hash, credential_type, expiry_timestamp, issuer_id, secret);

    let mut current_hash = commitment;

    for i in 0..20 {
        let sibling = path_elements[i];
        let direction = path_indices[i];

        assert((direction == 0) | (direction == 1), "path_indices must be binary");

        let left = current_hash * (1 - direction) + sibling * direction;
        let right = sibling * (1 - direction) + current_hash * direction;

        current_hash = merkle_hash(left, right);
    }

    assert(current_hash == credentials_root, "computed Merkle root != public credentials_root");
}

#[test]
fn test_kyc() {
    let user_address_hash = 123;
    let credential_type = 0;
    let expiry_timestamp = 2000000000;
    let issuer_id = 456;
    let secret = 789;

    let commitment = poseidon_5(user_address_hash, credential_type, expiry_timestamp, issuer_id, secret);

    let mut path_elements = [0; 20];
    let mut path_indices = [0; 20];
    let mut current_hash = commitment;
    for i in 0..20 {
        let left = current_hash;
        let right = 0;
        current_hash = merkle_hash(left, right);
    }
    let credentials_root = current_hash;
    std::println("CREDENTIALS ROOT:");
    std::println(credentials_root);
    let current_timestamp = 1000000000;
    
    main(
        user_address_hash,
        credential_type,
        expiry_timestamp,
        issuer_id,
        secret,
        path_elements,
        path_indices,
        credentials_root,
        current_timestamp,
        credential_type,
        issuer_id,
        user_address_hash,
    );
}

#[test(should_fail)]
fn test_kyc_expired() {
    let user_address_hash = 123;
    let credential_type = 0;
    let expiry_timestamp = 1000000000; // past
    let issuer_id = 456;
    let secret = 789;

    let commitment = poseidon_5(user_address_hash, credential_type, expiry_timestamp, issuer_id, secret);

    let mut path_elements = [0; 20];
    let mut path_indices = [0; 20];
    let mut current_hash = commitment;
    for i in 0..20 {
        let left = current_hash;
        let right = 0;
        current_hash = merkle_hash(left, right);
    }
    let credentials_root = current_hash;
    let current_timestamp = 2000000000; // future
    
    main(
        user_address_hash,
        credential_type,
        expiry_timestamp,
        issuer_id,
        secret,
        path_elements,
        path_indices,
        credentials_root,
        current_timestamp,
        credential_type,
        issuer_id,
        user_address_hash,
    );
}
