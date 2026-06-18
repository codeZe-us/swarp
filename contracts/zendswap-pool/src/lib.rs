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

// 2^63 - 1: upper bound matching the circuit's 64-bit range proof.
const MAX_DEPOSIT_AMOUNT: i128 = i64::MAX as i128;

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1 << TREE_DEPTH;
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

// Amount is excluded from the event intentionally: the token transfer is already
// on-chain, but omitting it here avoids making correlation across event feeds easier.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DepositEvent {
    pub commitment: BytesN<32>,
    pub leaf_index: u32,
    pub token: Address,
}

fn extend_ttl(env: &Env) {
    env.storage().instance().extend_ttl(17280, 518400);
}

fn current_to_bytes(env: &Env, val: &U256) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    val.to_be_bytes().copy_into_slice(&mut bytes);
    BytesN::from_array(env, &bytes)
}

fn bytes_to_u256(env: &Env, b: &BytesN<32>) -> U256 {
    let arr = b.to_array();
    use soroban_sdk::Bytes;
    let bytes = Bytes::from_array(env, &arr);
    U256::from_be_bytes(env, &bytes)
}

// zeros[0] = Poseidon2([0]), zeros[i] = Poseidon2([zeros[i-1], zeros[i-1]])
fn get_zeros_bytes(env: &Env) -> Vec<BytesN<32>> {
    let mut zeros: Vec<BytesN<32>> = Vec::new(env);
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_u32(env, 0));
    let z0 = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    zeros.push_back(current_to_bytes(env, &z0));
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

fn compute_empty_tree_root(env: &Env) -> BytesN<32> {
    get_zeros_bytes(env).get_unchecked(TREE_DEPTH)
}

fn hash_pair(env: &Env, left: &BytesN<32>, right: &BytesN<32>) -> BytesN<32> {
    let mut inputs = Vec::new(env);
    inputs.push_back(bytes_to_u256(env, left));
    inputs.push_back(bytes_to_u256(env, right));
    current_to_bytes(env, &poseidon2_hash::<4, Bn254Fr>(env, &inputs))
}

fn get_level_0_empty_leaf(env: &Env) -> BytesN<32> {
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_u32(env, 0));
    current_to_bytes(env, &poseidon2_hash::<4, Bn254Fr>(env, &inputs))
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

        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Usdc, &usdc);
        env.storage().instance().set(&DataKey::Eurc, &eurc);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::ExchangeRateNumerator, &rate_numerator);
        env.storage().instance().set(&DataKey::ExchangeRateDenominator, &rate_denominator);
        env.storage().instance().set(&DataKey::CurrentIndex, &0u32);

        let leaves: Vec<BytesN<32>> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::Leaves, &leaves);
        env.storage().persistent().extend_ttl(&DataKey::Leaves, 17280, 518400);

        let zeros = get_zeros_bytes(&env);
        let mut filled: Vec<BytesN<32>> = Vec::new(&env);
        for i in 0..TREE_DEPTH {
            filled.push_back(zeros.get_unchecked(i));
        }
        env.storage().instance().set(&DataKey::FilledSubtrees, &filled);

        let empty_root = zeros.get_unchecked(TREE_DEPTH);
        env.storage().instance().set(&DataKey::CurrentRoot, &empty_root);

        let mut recent_roots: Vec<BytesN<32>> = Vec::new(&env);
        recent_roots.push_back(empty_root);
        env.storage().instance().set(&DataKey::RecentRoots, &recent_roots);

        extend_ttl(&env);
    }

    pub fn insert_leaf(env: Env, commitment: BytesN<32>) -> (u32, BytesN<32>) {
        extend_ttl(&env);
        do_insert_leaf(&env, commitment)
    }

    #[allow(deprecated)] // events().publish() deprecated; emit() not yet in soroban-sdk v26.
    pub fn deposit(
        env: Env,
        depositor: Address,
        token: Address,
        amount: i128,
        commitment: BytesN<32>,
    ) -> u32 {
        extend_ttl(&env);

        depositor.require_auth();

        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let eurc: Address = env.storage().instance().get(&DataKey::Eurc).unwrap();
        if token != usdc && token != eurc {
            panic!("unsupported token");
        }

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if amount > MAX_DEPOSIT_AMOUNT {
            panic!("amount exceeds maximum");
        }

        TokenClient::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        let (leaf_index, _) = do_insert_leaf(&env, commitment.clone());

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "deposit"),),
            DepositEvent { commitment, leaf_index, token },
        );

        leaf_index
    }

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
        let usdc_balance = TokenClient::new(&env, &usdc).balance(&env.current_contract_address());
        let eurc_balance = TokenClient::new(&env, &eurc).balance(&env.current_contract_address());
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

// Frontier algorithm: update exactly TREE_DEPTH nodes along the insertion path.
// filled[i] holds the last completed left-sibling at level i.
fn do_insert_leaf(env: &Env, commitment: BytesN<32>) -> (u32, BytesN<32>) {
    let leaf_index: u32 = env
        .storage()
        .instance()
        .get(&DataKey::CurrentIndex)
        .unwrap_or(0);

    if leaf_index >= MAX_LEAVES {
        panic!("tree is full");
    }

    let mut leaves: Vec<BytesN<32>> = env
        .storage()
        .persistent()
        .get(&DataKey::Leaves)
        .unwrap_or_else(|| Vec::new(env));
    leaves.push_back(commitment.clone());
    env.storage().persistent().set(&DataKey::Leaves, &leaves);
    env.storage().persistent().extend_ttl(&DataKey::Leaves, 17280, 518400);

    let mut filled: Vec<BytesN<32>> = env.storage().instance().get(&DataKey::FilledSubtrees).unwrap();
    let zeros = get_zeros_bytes(env);

    let mut current_hash = commitment;
    let mut idx = leaf_index;
    for level in 0..TREE_DEPTH {
        if idx % 2 == 0 {
            filled.set(level, current_hash.clone());
            current_hash = hash_pair(env, &current_hash, &zeros.get_unchecked(level));
        } else {
            current_hash = hash_pair(env, &filled.get_unchecked(level), &current_hash);
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

// Not a contract entry-point: full tree iteration exceeds Soroban's instruction budget.
// Test-only native call.
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

    fn setup_pool_with_sac(
        env: &Env,
    ) -> (ZendSwapPoolClient<'_>, Address, Address, Address, Address) {
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
        soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr).mint(&depositor, &1_000_000_000);
        soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr).mint(&depositor, &1_000_000_000);
        (client, usdc_addr, eurc_addr, depositor, contract_id)
    }

    // Small BN254-safe commitment value (fits within field modulus).
    fn commitment(env: &Env, val: u32) -> BytesN<32> {
        let mut bytes = [0u8; 32];
        bytes[28..32].copy_from_slice(&val.to_be_bytes());
        BytesN::from_array(env, &bytes)
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

        let (numerator, denominator) = client.get_rate();
        assert_eq!(numerator, 9200000);
        assert_eq!(denominator, 10000000);
        assert_eq!(client.get_leaf_count(), 0);
        assert_eq!(client.get_leaf(&0), get_level_0_empty_leaf(&env));
        assert_eq!(client.get_root(), compute_empty_tree_root(&env));
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

        let (res_usdc, res_eurc) = client.get_reserves();
        assert_eq!(res_usdc, 0);
        assert_eq!(res_eurc, 0);

        soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&contract_id, &1000);
        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &2000);

        let (res_usdc_new, res_eurc_new) = client.get_reserves();
        assert_eq!(res_usdc_new, 1000);
        assert_eq!(res_eurc_new, 2000);
    }

    #[test]
    fn test_insert_leaf_changes_root() {
        let env = Env::default();
        let (client, _, _, _) = setup_pool(&env);
        let empty_root = client.get_root();
        let commitment = BytesN::from_array(&env, &[
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        let (leaf_idx, new_root) = client.insert_leaf(&commitment);
        assert_eq!(leaf_idx, 0);
        assert_ne!(new_root, empty_root);
        assert_eq!(client.get_root(), new_root);
        assert_eq!(client.get_leaf_count(), 1);
        assert_eq!(client.get_leaf(&0), commitment);
    }

    #[test]
    fn test_insert_two_leaves_root_matches_compute_root() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        // Values must be < BN254 field modulus.
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

        let expected_root = compute_root_from_leaves(
            &env,
            &alloc::vec![commitment_a.clone(), commitment_b.clone()],
        );
        assert_eq!(root_after_b, expected_root);
    }

    #[test]
    fn test_verify_merkle_root() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        let empty_root = client.get_root();
        assert!(client.verify_merkle_root(&empty_root));

        let commitment = BytesN::from_array(&env, &[
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x42,
        ]);
        let (_, new_root) = client.insert_leaf(&commitment);
        assert!(client.verify_merkle_root(&new_root));

        let fake_root = BytesN::from_array(&env, &[0xFF; 32]);
        assert!(!client.verify_merkle_root(&fake_root));
    }

    #[test]
    fn test_recent_roots_buffer_capacity() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        let empty_root = client.get_root();
        assert!(client.verify_merkle_root(&empty_root));

        for i in 0u32..MAX_RECENT_ROOTS {
            let mut leaf_bytes = [0u8; 32];
            leaf_bytes[28..32].copy_from_slice(&i.to_be_bytes());
            client.insert_leaf(&BytesN::from_array(&env, &leaf_bytes));
        }

        assert!(!client.verify_merkle_root(&empty_root));
        assert!(client.verify_merkle_root(&client.get_root()));
    }

    #[test]
    fn test_single_leaf_root_parity() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let (client, _, _, _) = setup_pool(&env);

        let mut leaf_bytes = [0u8; 32];
        leaf_bytes[31] = 1;
        let commitment = BytesN::from_array(&env, &leaf_bytes);
        let (_, new_root) = client.insert_leaf(&commitment);

        // leaf_index=0 → all levels are left-child, so we hash with the zero subtree on the right.
        let zeros = get_zeros_bytes(&env);
        let mut current = commitment;
        for level in 0..TREE_DEPTH {
            current = hash_pair(&env, &current, &zeros.get_unchecked(level));
        }
        assert_eq!(new_root, current);
    }

    #[test]
    fn test_deposit_success_usdc() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, _, depositor, contract_id) = setup_pool_with_sac(&env);
        let c = commitment(&env, 42);
        let leaf_idx = client.deposit(&depositor, &usdc_addr, &1000, &c);
        assert_eq!(leaf_idx, 0);
        assert_eq!(client.get_leaf_count(), 1);
        assert_eq!(client.get_leaf(&0), c);
        assert_eq!(TokenClient::new(&env, &usdc_addr).balance(&contract_id), 1000);
    }

    #[test]
    fn test_deposit_success_eurc() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, eurc_addr, depositor, contract_id) = setup_pool_with_sac(&env);
        let c = commitment(&env, 7);
        let leaf_idx = client.deposit(&depositor, &eurc_addr, &500, &c);
        assert_eq!(leaf_idx, 0);
        assert_eq!(TokenClient::new(&env, &eurc_addr).balance(&contract_id), 500);
    }

    #[test]
    #[should_panic(expected = "unsupported token")]
    fn test_deposit_unknown_token_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _, depositor, _) = setup_pool_with_sac(&env);
        client.deposit(&depositor, &Address::generate(&env), &100, &commitment(&env, 1));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_zero_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        client.deposit(&depositor, &usdc_addr, &0, &commitment(&env, 1));
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_deposit_negative_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        client.deposit(&depositor, &usdc_addr, &-1, &commitment(&env, 1));
    }

    #[test]
    fn test_deposit_increments_leaf_count_sequentially() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();
        let (client, usdc_addr, eurc_addr, depositor, _) = setup_pool_with_sac(&env);
        for i in 0u32..5 {
            let token = if i % 2 == 0 { &usdc_addr } else { &eurc_addr };
            let c = commitment(&env, i + 1);
            let leaf_idx = client.deposit(&depositor, token, &100, &c);
            assert_eq!(leaf_idx, i);
            assert_eq!(client.get_leaf_count(), i + 1);
            assert_eq!(client.get_leaf(&i), c);
        }
    }

    #[test]
    fn test_deposit_requires_depositor_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        client.deposit(&depositor, &usdc_addr, &100, &commitment(&env, 99));
        // Verify depositor.require_auth() was invoked.
        assert!(env.auths().iter().any(|(addr, _)| addr == &depositor));
    }

    #[test]
    fn test_deposit_root_changes_after_deposit() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, _, depositor, _) = setup_pool_with_sac(&env);
        let empty_root = client.get_root();
        client.deposit(&depositor, &usdc_addr, &1000, &commitment(&env, 5));
        let new_root = client.get_root();
        assert_ne!(new_root, empty_root);
        assert!(client.verify_merkle_root(&new_root));
    }
}
