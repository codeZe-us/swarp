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
}

fn extend_ttl(env: &Env) {
    env.storage().instance().extend_ttl(17280, 518400); // 1 day threshold, ~30 days extension
}

fn get_level_0_empty_leaf(env: &Env) -> BytesN<32> {
    let mut inputs = Vec::new(env);
    inputs.push_back(U256::from_u32(env, 0));
    let current = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    let mut bytes = [0u8; 32];
    current.to_be_bytes().copy_into_slice(&mut bytes);
    BytesN::from_array(env, &bytes)
}

fn compute_empty_tree_root(env: &Env) -> BytesN<32> {
    let mut current = U256::from_u32(env, 0);
    // zeros[0] = Poseidon2([0])
    let mut inputs = Vec::new(env);
    inputs.push_back(current);
    current = poseidon2_hash::<4, Bn254Fr>(env, &inputs);
    
    // Compute zeros[1..=20]
    for _ in 0..20 {
        let mut inputs_pair = Vec::new(env);
        inputs_pair.push_back(current.clone());
        inputs_pair.push_back(current.clone());
        current = poseidon2_hash::<4, Bn254Fr>(env, &inputs_pair);
    }
    
    let mut root_bytes = [0u8; 32];
    current.to_be_bytes().copy_into_slice(&mut root_bytes);
    BytesN::from_array(env, &root_bytes)
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
        
        // Initial empty tree root
        let empty_root = compute_empty_tree_root(&env);
        env.storage().instance().set(&DataKey::CurrentRoot, &empty_root);
        
        // Seed recent roots
        let mut recent_roots = Vec::new(&env);
        recent_roots.push_back(empty_root);
        env.storage().instance().set(&DataKey::RecentRoots, &recent_roots);
        
        extend_ttl(&env);
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
        let leaves: Vec<BytesN<32>> = env.storage().persistent().get(&DataKey::Leaves).unwrap_or_else(|| Vec::new(&env));
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


#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, Address};

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
        
        // Check root is correctly computed
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
}
