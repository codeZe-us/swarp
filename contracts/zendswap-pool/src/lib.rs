#![no_std]

extern crate alloc;
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, Vec, U256,
};
use soroban_poseidon::poseidon2_hash;
use soroban_sdk::crypto::bn254::Bn254Fr;
use soroban_sdk::token::Client as TokenClient;

/// Maximum deposit amount: 2^63 - 1 (matches circuit 64-bit range proof).
const MAX_DEPOSIT_AMOUNT: i128 = i64::MAX as i128;

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1 << TREE_DEPTH; // 2^20 = 1,048,576
const MAX_RECENT_ROOTS: u32 = 100;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Initialized,
    Admin,
    Usdc,
    Eurc,
    Verifier,
    ExchangeRateNumerator,
    ExchangeRateDenominator,
    CurrentIndex,
    Leaves,
    Nullifier(BytesN<32>),
    RecentRoots,
    CurrentRoot,
    FilledSubtrees,
}

/// Event emitted on each successful deposit.
/// Amount is deliberately excluded — even though it is visible in the token transfer,
/// omitting it from the event feed avoids making statistical correlation easier.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DepositEvent {
    pub commitment: BytesN<32>,
    pub leaf_index: u32,
    pub token: Address,
}

fn extend_ttl(env: &Env) {
    env.storage().instance().extend_ttl(17280, 518400); // 1 day threshold, ~30 days extension
}

/// Convert a U256 field element to a 32-byte big-endian BytesN<32>.
fn current_to_bytes(env: &Env, val: &U256) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    val.to_be_bytes().copy_into_slice(&mut bytes);
    BytesN::from_array(env, &bytes)
}

/// Convert a BytesN<32> back to a U256 for hashing.
fn bytes_to_u256(env: &Env, b: &BytesN<32>) -> U256 {
    let arr = b.to_array();
    use soroban_sdk::Bytes;
    let bytes = Bytes::from_array(env, &arr);
    U256::from_be_bytes(env, &bytes)
}

/// Compute zeros[0..=TREE_DEPTH] — precomputed empty-subtree hashes at each level.
/// zeros[0] = Poseidon2([0])
/// zeros[i] = Poseidon2([zeros[i-1], zeros[i-1]])
fn get_zeros_bytes(env: &Env) -> Vec<BytesN<32>> {
    let mut zeros: Vec<BytesN<32>> = Vec::new(env);

    // zeros[0]: hash of the single zero element
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_u32(env, 0));
    let z0 = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    zeros.push_back(current_to_bytes(env, &z0));

    // zeros[1..TREE_DEPTH]: pair of the previous level's zero hash
    let mut prev = z0;
    for _ in 0..TREE_DEPTH {
        let mut pair = Vec::new(env);
        pair.push_back(prev.clone());
        pair.push_back(prev.clone());
        let next = poseidon2_hash::<4, Bn254Fr>(env, &pair);
        zeros.push_back(current_to_bytes(env, &next));
        prev = next;
    }

    zeros
}

/// Compute the empty-tree root (zeros[TREE_DEPTH]).
fn compute_empty_tree_root(env: &Env) -> BytesN<32> {
    let zeros = get_zeros_bytes(env);
    zeros.get_unchecked(TREE_DEPTH)
}

/// Hash two sibling nodes: Poseidon2([left, right]).
fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let l = bytes_to_u256(env, left);
    let r = bytes_to_u256(env, right);
    let mut inputs = Vec::new(env);
    inputs.push_back(l);
    inputs.push_back(r);
    let result = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    current_to_bytes(env, &result)
}

/// Level-0 empty leaf value: Poseidon2([0]).
fn get_level_0_empty_leaf(env: &Env) -> BytesN<32> {
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_u32(env, 0));
    let current = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    current_to_bytes(env, &current)
}

#[contract]
pub struct ZendSwapPool;

#[contractimpl]
impl ZendSwapPool {
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc: Address,
        eurc: Address,
        verifier: Address,
        rate_numerator: u64,
        rate_denominator: u64,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }

        // Setup initial storage
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Usdc, &usdc);
        env.storage().instance().set(&DataKey::Eurc, &eurc);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::ExchangeRateNumerator, &rate_numerator);
        env.storage().instance().set(&DataKey::ExchangeRateDenominator, &rate_denominator);

        // Merkle tree initial state
        env.storage().instance().set(&DataKey::CurrentIndex, &0u32);

        // Leaves are in persistent storage
        let leaves: Vec<BytesN<32>> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::Leaves, &leaves);
        env.storage().persistent().extend_ttl(&DataKey::Leaves, 17280, 518400);

        // Precompute zero-hashes at each level (frontier initial values)
        let zeros = get_zeros_bytes(&env);

        // FilledSubtrees[i] represents the last filled left-sibling at level i.
        // Initialise all to zeros[i] (the empty subtree hash for that level).
        let mut filled: Vec<BytesN<32>> = Vec::new(&env);
        for i in 0..TREE_DEPTH {
            filled.push_back(zeros.get_unchecked(i));
        }
        env.storage().instance().set(&DataKey::FilledSubtrees, &filled);

        // Initial empty tree root is zeros[TREE_DEPTH]
        let empty_root = zeros.get_unchecked(TREE_DEPTH);
        env.storage().instance().set(&DataKey::CurrentRoot, &empty_root);

        // Seed recent roots with the empty root
        let mut recent_roots: Vec<BytesN<32>> = Vec::new(&env);
        recent_roots.push_back(empty_root);
        env.storage().instance().set(&DataKey::RecentRoots, &recent_roots);

        extend_ttl(&env);
    }

    /// Insert a new commitment leaf into the Merkle tree.
    /// Uses a frontier-based incremental update (exactly TREE_DEPTH hashes).
    /// Returns (leaf_index, new_root).
    pub fn insert_leaf(env: Env, commitment: BytesN<32>) -> (u32, BytesN<32>) {
        extend_ttl(&env);
        do_insert_leaf(&env, commitment)
    }

    /// Deposit `amount` of `token` (USDC or EURC) and register `commitment` in the Merkle tree.
    ///
    /// # Arguments
    /// * `depositor`  – the account providing funds; must authorise this call.
    /// * `token`      – must be the configured USDC or EURC address.
    /// * `amount`     – must be positive and ≤ 2^63−1.
    /// * `commitment` – opaque Poseidon commitment supplied by the depositor.
    ///
    /// # Returns
    /// The leaf index where the commitment was inserted.
    ///
    /// # Events
    /// Publishes `("deposit", commitment, leaf_index, token)` — amount is intentionally
    /// omitted from the event to avoid making cross-transaction correlation easier.
    #[allow(deprecated)] // events().publish() is deprecated in favour of #[contractevent]+emit(),
    // but the emit() API is not yet available in soroban-sdk v26. This warning is harmless.
    pub fn deposit(
        env: Env,
        depositor: Address,
        token: Address,
        amount: i128,
        commitment: BytesN<32>,
    ) -> u32 {
        extend_ttl(&env);

        // 1. Require the depositor to authorise this call.
        depositor.require_auth();

        // 2. Validate token is one of the two supported assets.
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let eurc: Address = env.storage().instance().get(&DataKey::Eurc).unwrap();
        if token != usdc && token != eurc {
            panic!("unsupported token");
        }

        // 3. Validate amount is positive and within the circuit's 64-bit range.
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if amount > MAX_DEPOSIT_AMOUNT {
            panic!("amount exceeds maximum");
        }

        // 4. Pull the tokens from the depositor into this contract.
        TokenClient::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        // 5. Insert the commitment into the Merkle tree.
        let (leaf_index, _new_root) = do_insert_leaf(&env, commitment.clone());

        // 6. Emit a deposit event. Amount is deliberately NOT included.
        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "deposit"),),
            DepositEvent { commitment, leaf_index, token },
        );

        leaf_index
    }

    /// Check if `root` exists in the recent roots ring buffer.
    pub fn verify_merkle_root(env: Env, root: BytesN<32>) -> bool {
        extend_ttl(&env);

        let recent_roots: Vec<BytesN<32>> = env
            .storage()
            .instance()
            .get(&DataKey::RecentRoots)
            .unwrap_or_else(|| Vec::new(&env));

        for r in recent_roots.iter() {
            if r == root {
                return true;
            }
        }
        false
    }

    pub fn get_root(env: Env) -> BytesN<32> {
        extend_ttl(&env);
        env.storage().instance().get(&DataKey::CurrentRoot).unwrap()
    }

    pub fn get_rate(env: Env) -> (u64, u64) {
        extend_ttl(&env);
        let num: u64 = env.storage().instance().get(&DataKey::ExchangeRateNumerator).unwrap();
        let denom: u64 = env.storage().instance().get(&DataKey::ExchangeRateDenominator).unwrap();
        (num, denom)
    }

    pub fn get_reserves(env: Env) -> (i128, i128) {
        extend_ttl(&env);
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let eurc: Address = env.storage().instance().get(&DataKey::Eurc).unwrap();

        let usdc_client = TokenClient::new(&env, &usdc);
        let eurc_client = TokenClient::new(&env, &eurc);

        let usdc_balance = usdc_client.balance(&env.current_contract_address());
        let eurc_balance = eurc_client.balance(&env.current_contract_address());

        (usdc_balance, eurc_balance)
    }

    pub fn get_leaf(env: Env, index: u32) -> BytesN<32> {
        extend_ttl(&env);
        let leaves: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::Leaves)
            .unwrap_or_else(|| Vec::new(&env));
        if index < leaves.len() {
            leaves.get_unchecked(index)
        } else {
            get_level_0_empty_leaf(&env)
        }
    }

    pub fn get_leaf_count(env: Env) -> u32 {
        extend_ttl(&env);
        env.storage().instance().get(&DataKey::CurrentIndex).unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Private helper: Merkle tree insertion logic shared by insert_leaf and deposit.
// Exactly TREE_DEPTH Poseidon2 hashes per call.
// ---------------------------------------------------------------------------
fn do_insert_leaf(env: &Env, commitment: BytesN<32>) -> (u32, BytesN<32>) {
    let leaf_index: u32 = env
        .storage()
        .instance()
        .get(&DataKey::CurrentIndex)
        .unwrap_or(0);

    if leaf_index >= MAX_LEAVES {
        panic!("tree is full");
    }

    // Append to persistent leaves array
    let mut leaves: Vec<BytesN<32>> = env
        .storage()
        .persistent()
        .get(&DataKey::Leaves)
        .unwrap_or_else(|| Vec::new(env));
    leaves.push_back(commitment.clone());
    env.storage().persistent().set(&DataKey::Leaves, &leaves);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Leaves, 17280, 518400);

    // Frontier-based root recomputation
    let mut filled: Vec<BytesN<32>> = env
        .storage()
        .instance()
        .get(&DataKey::FilledSubtrees)
        .unwrap();
    let zeros = get_zeros_bytes(env);

    let mut current_hash = commitment;
    let mut idx = leaf_index;
    for level in 0..TREE_DEPTH {
        if idx % 2 == 0 {
            filled.set(level, current_hash.clone());
            current_hash = hash_pair(env, &current_hash, &zeros.get_unchecked(level));
        } else {
            let left = filled.get_unchecked(level);
            current_hash = hash_pair(env, &left, &current_hash);
        }
        idx >>= 1;
    }
    let new_root = current_hash;

    env.storage().instance().set(&DataKey::FilledSubtrees, &filled);
    env.storage().instance().set(&DataKey::CurrentIndex, &(leaf_index + 1));
    env.storage().instance().set(&DataKey::CurrentRoot, &new_root);

    let mut recent_roots: Vec<BytesN<32>> = env
        .storage()
        .instance()
        .get(&DataKey::RecentRoots)
        .unwrap_or_else(|| Vec::new(env));
    recent_roots.push_back(new_root.clone());
    if recent_roots.len() > MAX_RECENT_ROOTS {
        recent_roots.remove(0);
    }
    env.storage().instance().set(&DataKey::RecentRoots, &recent_roots);

    (leaf_index, new_root)
}

// ---------------------------------------------------------------------------
// Standalone helper: full Merkle root recomputation from stored leaves.
// This is intentionally NOT a contract entry-point: iterating 2^20 leaf slots
// far exceeds Soroban's per-transaction instruction budget. Use it in tests
// via direct native (non-metered) calls only.
// ---------------------------------------------------------------------------
#[cfg(test)]
fn compute_root_from_leaves(env: &Env, leaves: &alloc::vec::Vec<BytesN<32>>) -> BytesN<32> {
    let leaf_count = leaves.len() as u32;
    let zeros = get_zeros_bytes(env);

    if leaf_count == 0 {
        return zeros.get_unchecked(TREE_DEPTH);
    }

    let total = MAX_LEAVES as usize;
    let mut layer: alloc::vec::Vec<BytesN<32>> = alloc::vec::Vec::with_capacity(total);
    for i in 0..total {
        if (i as u32) < leaf_count {
            layer.push(leaves[i].clone());
        } else {
            layer.push(zeros.get_unchecked(0));
        }
    }

    let mut width = total;
    let mut level: u32 = 0;
    while width > 1 {
        let half = width / 2;
        let mut next_layer: alloc::vec::Vec<BytesN<32>> = alloc::vec::Vec::with_capacity(half);
        for i in 0..half {
            let left = &layer[2 * i];
            let right = &layer[2 * i + 1];
            let zero_at_level = zeros.get_unchecked(level);
            if *left == zero_at_level && *right == zero_at_level {
                next_layer.push(zeros.get_unchecked(level + 1));
            } else {
                next_layer.push(hash_pair(env, left, right));
            }
        }
        layer = next_layer;
        width = half;
        level += 1;
    }

    layer.into_iter().next().unwrap()
}

#[cfg(test)]
mod test_poseidon;

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, Address};

    fn setup_pool(env: &Env) -> (ZendSwapPoolClient<'_>, Address, Address, Address) {
        let admin = Address::generate(env);
        let usdc = Address::generate(env);
        let eurc = Address::generate(env);
        let verifier = Address::generate(env);
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(env, &contract_id);
        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);
        (client, usdc, eurc, verifier)
    }

    #[test]
    fn test_initialize_success() {
        let env = Env::default();

        let admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let eurc = Address::generate(&env);
        let verifier = Address::generate(&env);

        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);

        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);

        // Assert stored values
        let (numerator, denominator) = client.get_rate();
        assert_eq!(numerator, 9200000);
        assert_eq!(denominator, 10000000);

        assert_eq!(client.get_leaf_count(), 0);

        // Expected empty leaf (level 0 empty leaf)
        let expected_empty_leaf = get_level_0_empty_leaf(&env);
        assert_eq!(client.get_leaf(&0), expected_empty_leaf);

        // Check root is correctly computed (empty tree root)
        let current_root = client.get_root();
        let expected_root = compute_empty_tree_root(&env);
        assert_eq!(current_root, expected_root);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_fails() {
        let env = Env::default();

        let admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let eurc = Address::generate(&env);
        let verifier = Address::generate(&env);

        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);

        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);
        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);
    }

    #[test]
    fn test_get_reserves() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_addr = usdc_sac.address();
        let eurc_addr = eurc_sac.address();
        let verifier = Address::generate(&env);

        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);

        client.initialize(&admin, &usdc_addr, &eurc_addr, &verifier, &9200000, &10000000);

        // Assert initial reserves are 0
        let (res_usdc, res_eurc) = client.get_reserves();
        assert_eq!(res_usdc, 0);
        assert_eq!(res_eurc, 0);

        // Mint some tokens to the pool contract
        let usdc_client = soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr);
        let eurc_client = soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr);

        usdc_client.mint(&contract_id, &1000);
        eurc_client.mint(&contract_id, &2000);

        let (res_usdc_new, res_eurc_new) = client.get_reserves();
        assert_eq!(res_usdc_new, 1000);
        assert_eq!(res_eurc_new, 2000);
    }

    // -------------------------------------------------------------------------
    // Merkle tree tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_insert_leaf_changes_root() {
        let env = Env::default();
        let (client, _, _, _) = setup_pool(&env);

        let empty_root = client.get_root();

        // Create a dummy commitment (32 bytes, first byte = 1)
        let commitment = BytesN::from_array(&env, &[
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);

        let (leaf_idx, new_root) = client.insert_leaf(&commitment);

        assert_eq!(leaf_idx, 0, "first leaf index must be 0");
        assert_ne!(new_root, empty_root, "root must change after insertion");
        assert_eq!(client.get_root(), new_root, "get_root() must match returned root");
        assert_eq!(client.get_leaf_count(), 1);
        assert_eq!(client.get_leaf(&0), commitment);
    }

    #[test]
    fn test_insert_two_leaves_root_matches_compute_root() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        // Values must be < BN254 field modulus; use small safe integers encoded big-endian.
        let commitment_a = BytesN::from_array(&env, &[
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0A,
        ]);
        let commitment_b = BytesN::from_array(&env, &[
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0B,
        ]);

        let (idx_a, _) = client.insert_leaf(&commitment_a);
        let (idx_b, root_after_b) = client.insert_leaf(&commitment_b);

        assert_eq!(idx_a, 0);
        assert_eq!(idx_b, 1);
        assert_eq!(client.get_leaf_count(), 2);

        // Verify incremental root against native full-tree recomputation.
        // compute_root_from_leaves is a plain Rust fn — not subject to Soroban's
        // per-invocation instruction metering.
        let leaves_vec = alloc::vec![
            commitment_a.clone(),
            commitment_b.clone(),
        ];
        let expected_root = compute_root_from_leaves(&env, &leaves_vec);
        assert_eq!(root_after_b, expected_root,
            "incremental root must match full-tree recomputation");
    }

    #[test]
    fn test_verify_merkle_root() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        let empty_root = client.get_root();

        // Empty root should be in recent roots
        assert!(client.verify_merkle_root(&empty_root), "empty root should be in recent roots");

        // Value must be < BN254 field modulus; use a small safe integer.
        let commitment = BytesN::from_array(&env, &[
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42,
        ]);

        let (_, new_root) = client.insert_leaf(&commitment);

        // New root is in recent roots
        assert!(client.verify_merkle_root(&new_root), "new root should be in recent roots");

        // A random root should not be found
        let fake_root = BytesN::from_array(&env, &[
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
            0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        ]);
        assert!(!client.verify_merkle_root(&fake_root), "fake root must not be verified");
    }

    #[test]
    fn test_recent_roots_buffer_capacity() {
        let env = Env::default();
        // Increase instruction budget for this heavy test
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        // We need to insert MAX_RECENT_ROOTS leaves so that the initial empty root gets evicted.
        // After 100 insertions the buffer is full; the 101st insertion will evict the initial empty root.
        let empty_root = client.get_root();
        assert!(client.verify_merkle_root(&empty_root));

        // Insert MAX_RECENT_ROOTS leaves to fill the buffer
        for i in 0u32..MAX_RECENT_ROOTS {
            let mut leaf_bytes = [0u8; 32];
            let i_be = i.to_be_bytes();
            leaf_bytes[28..32].copy_from_slice(&i_be);
            let commitment = BytesN::from_array(&env, &leaf_bytes);
            client.insert_leaf(&commitment);
        }

        // After 100 insertions: buffer now holds roots 1..=100 (indices 1-100); empty root was
        // the 1st element and was evicted when the 101st entry (root_101) was appended.
        // Actually: after 100 inserts the buffer has 101 entries (empty + 100 new);
        // remove(0) runs when len > 100, i.e., on the 101st push.
        // So empty_root is removed on insert #100 (0-indexed: the 100th leaf push makes len = 101).
        assert!(
            !client.verify_merkle_root(&empty_root),
            "empty root must be evicted after {} insertions",
            MAX_RECENT_ROOTS
        );

        // The most-recently inserted root must still be there
        let current_root = client.get_root();
        assert!(client.verify_merkle_root(&current_root), "latest root must still be in buffer");
    }

    #[test]
    fn test_single_leaf_root_parity() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        // Insert commitment = 1 (as a 32-byte big-endian field element)
        let mut leaf_bytes = [0u8; 32];
        leaf_bytes[31] = 1;
        let commitment = BytesN::from_array(&env, &leaf_bytes);

        let (_, new_root) = client.insert_leaf(&commitment);

        // Manually reproduce the same computation the contract does:
        // leaf_index=0 means all levels are left-child (idx % 2 == 0),
        // so each level hashes current with the empty subtree on the right.
        let zeros = get_zeros_bytes(&env);
        let mut current = commitment;
        for level in 0..TREE_DEPTH {
            current = hash_pair(&env, &current, &zeros.get_unchecked(level));
        }

        assert_eq!(new_root, current, "single leaf root must match manual computation");
    }

    // =========================================================================
    // Deposit tests
    // =========================================================================

    /// Helper: registers two SAC tokens and a pool, returns client + token addresses + depositor.
    fn setup_pool_with_sac(
        env: &Env,
    ) -> (
        ZendSwapPoolClient<'_>,
        Address, // usdc_addr
        Address, // eurc_addr
        Address, // depositor
        Address, // contract_id
    ) {
        let admin = Address::generate(env);
        let depositor = Address::generate(env);

        let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_addr = usdc_sac.address();
        let eurc_addr = eurc_sac.address();
        let verifier = Address::generate(env);

        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(env, &contract_id);
        client.initialize(&admin, &usdc_addr, &eurc_addr, &verifier, &9200000, &10000000);

        // Mint tokens to the depositor so they have funds to deposit.
        let usdc_client = soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr);
        let eurc_client = soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr);
        usdc_client.mint(&depositor, &1_000_000_000);
        eurc_client.mint(&depositor, &1_000_000_000);

        (client, usdc_addr, eurc_addr, depositor, contract_id)
    }

    /// A valid commitment value (small integer, safely within BN254 field).
    fn commitment(env: &Env, val: u32) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        let be = val.to_be_bytes();
        bytes[28..32].copy_from_slice(&be);
        BytesN::from_array(env, &bytes)
    }

    #[test]
    fn test_deposit_success_usdc() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, usdc_addr, _, depositor, contract_id) = setup_pool_with_sac(&env);
        let c = commitment(&env, 42);

        let leaf_idx = client.deposit(&depositor, &usdc_addr, &1000, &c);

        assert_eq!(leaf_idx, 0, "first deposit lands at leaf index 0");
        assert_eq!(client.get_leaf_count(), 1, "leaf count incremented");
        assert_eq!(client.get_leaf(&0), c, "commitment stored at leaf 0");

        // Pool balance increased by the deposit amount
        let usdc_token = TokenClient::new(&env, &usdc_addr);
        assert_eq!(
            usdc_token.balance(&contract_id),
            1000,
            "pool USDC balance must equal deposited amount"
        );
    }

    #[test]
    fn test_deposit_success_eurc() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, eurc_addr, depositor, contract_id) = setup_pool_with_sac(&env);
        let c = commitment(&env, 7);

        let leaf_idx = client.deposit(&depositor, &eurc_addr, &500, &c);

        assert_eq!(leaf_idx, 0);
        let eurc_token = TokenClient::new(&env, &eurc_addr);
        assert_eq!(eurc_token.balance(&contract_id), 500);
    }

    #[test]
    #[should_panic(expected = "unsupported token")]
    fn test_deposit_unknown_token_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _, _, depositor, _) = setup_pool_with_sac(&env);
        let unknown = Address::generate(&env);
        let c = commitment(&env, 1);

        client.deposit(&depositor, &unknown, &100, &c);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        let c = commitment(&env, 1);

        client.deposit(&depositor, &usdc_addr, &0, &c);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_negative_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        let c = commitment(&env, 1);

        client.deposit(&depositor, &usdc_addr, &-1, &c);
    }

    #[test]
    fn test_deposit_increments_leaf_count_sequentially() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let (client, usdc_addr, eurc_addr, depositor, _) = setup_pool_with_sac(&env);

        for i in 0u32..5 {
            // Alternate between USDC and EURC to test both paths
            let token = if i % 2 == 0 { &usdc_addr } else { &eurc_addr };
            let c = commitment(&env, i + 1);
            let leaf_idx = client.deposit(&depositor, token, &100, &c);
            assert_eq!(leaf_idx, i, "leaf index must be sequential");
            assert_eq!(client.get_leaf_count(), i + 1, "leaf count after deposit {}", i);
            assert_eq!(client.get_leaf(&i), c, "commitment at leaf {}", i);
        }
    }

    #[test]
    fn test_deposit_requires_depositor_auth() {
        // Soroban unit test pattern: call with mock_all_auths() enabled, then verify
        // via env.auths() that depositor.require_auth() was actually invoked.
        // On-chain the Soroban host enforces that no auth entry ⟹ InvalidAction; in unit
        // tests we confirm the require_auth() call-site exists, which is the guarantee.
        let env = Env::default();
        env.mock_all_auths();

        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        let c = commitment(&env, 99);

        client.deposit(&depositor, &usdc_addr, &100, &c);

        // env.auths() returns every (authorizing_address, invocation) pair that was checked.
        // At least one entry must have come from the depositor.
        let auths = env.auths();
        assert!(
            auths.iter().any(|(addr, _)| addr == &depositor),
            "deposit must require authorization from the depositor"
        );
    }

    #[test]
    fn test_deposit_root_changes_after_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        let empty_root = client.get_root();
        let c = commitment(&env, 5);

        client.deposit(&depositor, &usdc_addr, &1000, &c);

        let new_root = client.get_root();
        assert_ne!(new_root, empty_root, "root must change after a deposit");
        assert!(
            client.verify_merkle_root(&new_root),
            "new root must be in recent roots"
        );
    }
}
