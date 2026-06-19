#![no_std]

extern crate alloc;
#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, Vec, U256, IntoVal, Symbol, Val,
};
use soroban_poseidon::poseidon2_hash;
use soroban_sdk::crypto::bn254::Bn254Fr;
use soroban_sdk::token::Client as TokenClient;

#[soroban_sdk::contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    UnsupportedToken = 3,
    InvalidAmount = 4,
    NullifierSpent = 5,
    InvalidMerkleRoot = 6,
    VerificationFailed = 7,
    VerifierPanic = 8,
    Unauthorized = 9,
    InvalidRate = 10,
}


// 2^63 - 1: upper bound matching the circuit's 64-bit range proof.
const MAX_DEPOSIT_AMOUNT: i128 = i64::MAX as i128;

const TREE_DEPTH: u32 = 20;
const MAX_LEAVES: u32 = 1 << TREE_DEPTH;
const MAX_RECENT_ROOTS: u32 = 100;
const MAX_RECENT_RATES: u32 = 10;

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
    RecentRates,
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

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RateUpdateEvent {
    pub new_rate: u64,
    pub new_denominator: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FundPoolEvent {
    pub funder: Address,
    pub token: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolInfo {
    pub usdc_reserve: i128,
    pub eurc_reserve: i128,
    pub current_rate: u64,
    pub rate_denominator: u64,
    pub total_deposits: u32,
    pub current_root: BytesN<32>,
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

#[cfg(test)]
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

        let mut recent_rates: Vec<u64> = Vec::new(&env);
        recent_rates.push_back(rate_numerator);
        env.storage().instance().set(&DataKey::RecentRates, &recent_rates);

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

    #[allow(deprecated)]
    pub fn set_rate(
        env: Env,
        admin: Address,
        new_rate: u64,
        new_denominator: u64,
    ) -> Result<(), Error> {
        extend_ttl(&env);

        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            return Err(Error::Unauthorized);
        }

        if new_rate == 0 || new_denominator == 0 {
            return Err(Error::InvalidRate);
        }

        if new_denominator != 10_000_000 {
            return Err(Error::InvalidRate);
        }

        if new_rate < 5_000_000 || new_rate > 20_000_000 {
            return Err(Error::InvalidRate);
        }

        env.storage().instance().set(&DataKey::ExchangeRateNumerator, &new_rate);
        env.storage().instance().set(&DataKey::ExchangeRateDenominator, &new_denominator);

        let mut recent_rates: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::RecentRates)
            .unwrap_or_else(|| Vec::new(&env));
        recent_rates.push_back(new_rate);
        if recent_rates.len() > MAX_RECENT_RATES {
            recent_rates.remove(0);
        }
        env.storage().instance().set(&DataKey::RecentRates, &recent_rates);

        env.events().publish(
            (Symbol::new(&env, "rate_update"),),
            RateUpdateEvent {
                new_rate,
                new_denominator,
            },
        );

        Ok(())
    }

    #[allow(deprecated)]
    pub fn fund_pool(
        env: Env,
        funder: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        extend_ttl(&env);

        funder.require_auth();

        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let eurc: Address = env.storage().instance().get(&DataKey::Eurc).unwrap();
        if token != usdc && token != eurc {
            return Err(Error::UnsupportedToken);
        }

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        TokenClient::new(&env, &token).transfer(
            &funder,
            &env.current_contract_address(),
            &amount,
        );

        env.events().publish(
            (Symbol::new(&env, "fund_pool"),),
            FundPoolEvent {
                funder,
                token,
                amount,
            },
        );

        Ok(())
    }

    pub fn get_pool_info(env: Env) -> PoolInfo {
        extend_ttl(&env);

        let (usdc_reserve, eurc_reserve) = Self::get_reserves(env.clone());
        let current_rate = env.storage().instance().get(&DataKey::ExchangeRateNumerator).unwrap_or(0);
        let rate_denominator = env.storage().instance().get(&DataKey::ExchangeRateDenominator).unwrap_or(1);
        let total_deposits = Self::get_leaf_count(env.clone());
        let current_root = Self::get_root(env.clone());

        PoolInfo {
            usdc_reserve,
            eurc_reserve,
            current_rate,
            rate_denominator,
            total_deposits,
            current_root,
        }
    }

    #[allow(deprecated)] // events().publish() deprecated; emit() not yet in soroban-sdk v26.
    pub fn withdraw(
        env: Env,
        recipient: Address,
        asset_out: Address,
        proof: Bytes,
        nullifier_hash: BytesN<32>,
        merkle_root: BytesN<32>,
        withdrawal_amount: i128,
    ) -> Result<(), Error> {
        extend_ttl(&env);

        // 1. Validate asset_out is either the stored USDC or EURC address
        let usdc: Address = env.storage().instance().get(&DataKey::Usdc).unwrap();
        let eurc: Address = env.storage().instance().get(&DataKey::Eurc).unwrap();
        if asset_out != usdc && asset_out != eurc {
            return Err(Error::UnsupportedToken);
        }

        // 2. Validate that withdrawal_amount is positive and within range
        if withdrawal_amount <= 0 || withdrawal_amount > MAX_DEPOSIT_AMOUNT {
            return Err(Error::InvalidAmount);
        }

        // 3. Check that the nullifier_hash has not been spent (not in the nullifier set)
        let nullifier_key = DataKey::Nullifier(nullifier_hash.clone());
        if env.storage().persistent().has(&nullifier_key) {
            return Err(Error::NullifierSpent);
        }

        // 4. Check that the merkle_root is in the recent roots buffer
        if !Self::verify_merkle_root(env.clone(), merkle_root.clone()) {
            return Err(Error::InvalidMerkleRoot);
        }

        // 5. Determine the asset_out_id (0 for USDC, 1 for EURC) to match the circuit's encoding
        let asset_out_id = if asset_out == usdc { 0u64 } else { 1u64 };

        fn u64_to_bytes32(env: &Env, val: u64) -> BytesN<32> {
            let mut bytes = [0u8; 32];
            bytes[24..32].copy_from_slice(&val.to_be_bytes());
            BytesN::from_array(env, &bytes)
        }

        // 6. Fetch exchange rate values
        let rate_denom: u64 = env.storage().instance().get(&DataKey::ExchangeRateDenominator).unwrap();

        // 7. Get historical rates to try
        let recent_rates: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::RecentRates)
            .unwrap_or_else(|| Vec::new(&env));

        let mut verified = false;
        let verifier: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();

        for rate in recent_rates.iter() {
            // Construct the public inputs array in the exact order the Noir circuit declares its pub parameters:
            // [merkle_root, nullifier_hash, exchange_rate, rate_denominator, asset_out_public]
            let mut public_inputs = Vec::new(&env);
            public_inputs.push_back(merkle_root.clone());
            public_inputs.push_back(nullifier_hash.clone());
            public_inputs.push_back(u64_to_bytes32(&env, rate));
            public_inputs.push_back(u64_to_bytes32(&env, rate_denom));
            public_inputs.push_back(u64_to_bytes32(&env, asset_out_id));

            let args = soroban_sdk::vec![&env, proof.clone().into_val(&env), public_inputs.into_val(&env)];
            let invoke_res = env.try_invoke_contract::<bool, Val>(&verifier, &Symbol::new(&env, "verify"), args);

            if let Ok(Ok(true)) = invoke_res {
                verified = true;
                break;
            }
        }

        if !verified {
            return Err(Error::VerificationFailed);
        }

        // 9. If verification returns true:
        // - Insert the nullifier into the spent set (effects first, checks-effects-interactions pattern to prevent reentrancy)
        env.storage().persistent().set(&nullifier_key, &true);
        env.storage().persistent().extend_ttl(&nullifier_key, 17280, 518400);

        // - Transfer withdrawal_amount of asset_out to the recipient
        TokenClient::new(&env, &asset_out).transfer(
            &env.current_contract_address(),
            &recipient,
            &withdrawal_amount,
        );

        // - Emit a withdrawal event with only the nullifier hash
        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            nullifier_hash,
        );

        // TODO: Security Warning! The withdrawal_amount parameter is passed as a regular parameter 
        // and is NOT verified by the proof on-chain (not constrained by the current public signals list). 
        // A malicious user could submit a valid proof for a small amount but pass a large withdrawal_amount.
        // Before real deployment, the Noir circuit must be updated to make withdrawal_amount a public parameter,
        // and the contract should extract this amount from the proof public signals instead of trust-passing it.

        Ok(())
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

    fn setup_pool_with_real_verifier(
        env: &Env,
    ) -> (ZendSwapPoolClient<'_>, Address, Address, Address, Address) {
        let admin = Address::generate(env);
        let depositor = Address::generate(env);
        let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_addr = usdc_sac.address();
        let eurc_addr = eurc_sac.address();
        
        let verifier = env.register(ultrahonk_verifier::UltraHonkVerifierContract, ());
        
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(env, &contract_id);
        client.initialize(&admin, &usdc_addr, &eurc_addr, &verifier, &9200000, &10000000);
        
        soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr).mint(&depositor, &1_000_000_000);
        soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr).mint(&depositor, &1_000_000_000);
        
        (client, usdc_addr, eurc_addr, depositor, contract_id)
    }

    #[test]
    fn test_withdraw_success_flow() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let (client, usdc_addr, eurc_addr, depositor, contract_id) =
            setup_pool_with_real_verifier(&env);

        let eurc_client = TokenClient::new(&env, &eurc_addr);

        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

        let commitment_bytes: [u8; 32] = [
            0x10, 0x53, 0xdc, 0xa3, 0xa0, 0x15, 0x9d, 0x82,
            0x31, 0xc5, 0x22, 0xb2, 0xb8, 0x12, 0x5e, 0xf5,
            0x9a, 0xe9, 0x32, 0xf1, 0x3f, 0x9a, 0x45, 0xcc,
            0x04, 0xe6, 0xcd, 0x94, 0x8d, 0xc5, 0xc9, 0x1b,
        ];
        let commitment = BytesN::from_array(&env, &commitment_bytes);
        let leaf_idx = client.deposit(&depositor, &usdc_addr, &500, &commitment);
        assert_eq!(leaf_idx, 0);

        let expected_root_bytes: [u8; 32] = [
            0x13, 0xd5, 0xa5, 0x93, 0x58, 0x21, 0x22, 0x52,
            0x11, 0x51, 0x7d, 0x91, 0xc3, 0xb2, 0x02, 0x47,
            0x0e, 0xd1, 0x05, 0x37, 0xde, 0x8b, 0x8d, 0x7a,
            0xa7, 0x65, 0xc0, 0xf1, 0x63, 0xab, 0x82, 0x88,
        ];
        let expected_root = BytesN::from_array(&env, &expected_root_bytes);
        assert_eq!(client.get_root(), expected_root);

        const STATIC_PROOF: &[u8] = include_bytes!("../../ultrahonk-verifier/static_proof.proof");
        let proof = Bytes::from_slice(&env, STATIC_PROOF);

        let recipient = Address::generate(&env);
        let nullifier_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c,
            0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11, 0xd4, 0xc3,
            0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48,
            0xe6, 0x91, 0x13, 0xb4, 0x35, 0x07, 0xda, 0xf8,
        ];
        let nullifier_hash = BytesN::from_array(&env, &nullifier_bytes);

        assert_eq!(eurc_client.balance(&recipient), 0);

        client.withdraw(
            &recipient,
            &eurc_addr,
            &proof,
            &nullifier_hash,
            &expected_root,
            &460,
        );

        assert_eq!(eurc_client.balance(&recipient), 460);
    }

    #[test]
    fn test_withdraw_double_spend_fails() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let (client, usdc_addr, eurc_addr, depositor, contract_id) =
            setup_pool_with_real_verifier(&env);

        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

        let commitment_bytes: [u8; 32] = [
            0x10, 0x53, 0xdc, 0xa3, 0xa0, 0x15, 0x9d, 0x82,
            0x31, 0xc5, 0x22, 0xb2, 0xb8, 0x12, 0x5e, 0xf5,
            0x9a, 0xe9, 0x32, 0xf1, 0x3f, 0x9a, 0x45, 0xcc,
            0x04, 0xe6, 0xcd, 0x94, 0x8d, 0xc5, 0xc9, 0x1b,
        ];
        client.deposit(&depositor, &usdc_addr, &500, &BytesN::from_array(&env, &commitment_bytes));

        const STATIC_PROOF: &[u8] = include_bytes!("../../ultrahonk-verifier/static_proof.proof");
        let proof = Bytes::from_slice(&env, STATIC_PROOF);

        let recipient = Address::generate(&env);
        let nullifier_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c,
            0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11, 0xd4, 0xc3,
            0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48,
            0xe6, 0x91, 0x13, 0xb4, 0x35, 0x07, 0xda, 0xf8,
        ];
        let nullifier_hash = BytesN::from_array(&env, &nullifier_bytes);
        let root = client.get_root();

        client.withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);

        let res2 = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);
        assert!(res2.is_err());
    }

    #[test]
    fn test_withdraw_invalid_root_fails() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let (client, usdc_addr, eurc_addr, depositor, contract_id) =
            setup_pool_with_real_verifier(&env);

        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

        let commitment_bytes: [u8; 32] = [
            0x10, 0x53, 0xdc, 0xa3, 0xa0, 0x15, 0x9d, 0x82,
            0x31, 0xc5, 0x22, 0xb2, 0xb8, 0x12, 0x5e, 0xf5,
            0x9a, 0xe9, 0x32, 0xf1, 0x3f, 0x9a, 0x45, 0xcc,
            0x04, 0xe6, 0xcd, 0x94, 0x8d, 0xc5, 0xc9, 0x1b,
        ];
        client.deposit(&depositor, &usdc_addr, &500, &BytesN::from_array(&env, &commitment_bytes));

        const STATIC_PROOF: &[u8] = include_bytes!("../../ultrahonk-verifier/static_proof.proof");
        let proof = Bytes::from_slice(&env, STATIC_PROOF);

        let recipient = Address::generate(&env);
        let nullifier_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c,
            0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11, 0xd4, 0xc3,
            0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48,
            0xe6, 0x91, 0x13, 0xb4, 0x35, 0x07, 0xda, 0xf8,
        ];
        let nullifier_hash = BytesN::from_array(&env, &nullifier_bytes);
        
        let fake_root = BytesN::from_array(&env, &[0xFF; 32]);

        let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &fake_root, &460);
        assert!(res.is_err());
    }

    #[test]
    fn test_withdraw_invalid_proof_fails_no_panic() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let (client, usdc_addr, eurc_addr, depositor, contract_id) =
            setup_pool_with_real_verifier(&env);

        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

        let commitment_bytes: [u8; 32] = [
            0x10, 0x53, 0xdc, 0xa3, 0xa0, 0x15, 0x9d, 0x82,
            0x31, 0xc5, 0x22, 0xb2, 0xb8, 0x12, 0x5e, 0xf5,
            0x9a, 0xe9, 0x32, 0xf1, 0x3f, 0x9a, 0x45, 0xcc,
            0x04, 0xe6, 0xcd, 0x94, 0x8d, 0xc5, 0xc9, 0x1b,
        ];
        client.deposit(&depositor, &usdc_addr, &500, &BytesN::from_array(&env, &commitment_bytes));

        let garbage_proof = Bytes::from_slice(&env, &[0u8; 14592]);

        let recipient = Address::generate(&env);
        let nullifier_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c,
            0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11, 0xd4, 0xc3,
            0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48,
            0xe6, 0x91, 0x13, 0xb4, 0x35, 0x07, 0xda, 0xf8,
        ];
        let nullifier_hash = BytesN::from_array(&env, &nullifier_bytes);
        let root = client.get_root();

        let res = client.try_withdraw(&recipient, &eurc_addr, &garbage_proof, &nullifier_hash, &root, &460);
        assert!(res.is_err());
    }

    #[test]
    fn test_set_rate_success() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let eurc = Address::generate(&env);
        let verifier = Address::generate(&env);
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);

        let (n, d) = client.get_rate();
        assert_eq!(n, 9_200_000);
        assert_eq!(d, 10_000_000);

        client.set_rate(&admin, &12_500_000, &10_000_000);
        let (n2, d2) = client.get_rate();
        assert_eq!(n2, 12_500_000);
        assert_eq!(d2, 10_000_000);
    }

    #[test]
    fn test_set_rate_unauthorized_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let not_admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let eurc = Address::generate(&env);
        let verifier = Address::generate(&env);
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);

        let res = client.try_set_rate(&not_admin, &12_500_000, &10_000_000);
        assert!(res.is_err());
    }

    #[test]
    fn test_set_rate_bounds_fail() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let eurc = Address::generate(&env);
        let verifier = Address::generate(&env);
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc, &eurc, &verifier, &9200000, &10000000);

        assert!(client.try_set_rate(&admin, &9_200_000, &10_000_001).is_err());
        assert!(client.try_set_rate(&admin, &9_200_000, &9_999_999).is_err());
        assert!(client.try_set_rate(&admin, &4_999_999, &10_000_000).is_err());
        assert!(client.try_set_rate(&admin, &20_000_001, &10_000_000).is_err());
        assert!(client.try_set_rate(&admin, &0, &10_000_000).is_err());
        assert!(client.try_set_rate(&admin, &9_200_000, &0).is_err());
    }

    #[test]
    fn test_fund_pool_success() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, usdc_addr, eurc_addr, funder, _contract_id) = setup_pool_with_sac(&env);

        let (r_usdc, r_eurc) = client.get_reserves();
        assert_eq!(r_usdc, 0);
        assert_eq!(r_eurc, 0);

        client.fund_pool(&funder, &usdc_addr, &1_000_000);
        let (r_usdc2, r_eurc2) = client.get_reserves();
        assert_eq!(r_usdc2, 1_000_000);
        assert_eq!(r_eurc2, 0);

        client.fund_pool(&funder, &eurc_addr, &2_000_000);
        let (r_usdc3, r_eurc3) = client.get_reserves();
        assert_eq!(r_usdc3, 1_000_000);
        assert_eq!(r_eurc3, 2_000_000);

        assert!(client.try_fund_pool(&funder, &Address::generate(&env), &100).is_err());
        assert!(client.try_fund_pool(&funder, &usdc_addr, &0).is_err());
        assert!(client.try_fund_pool(&funder, &usdc_addr, &-10).is_err());
    }

    #[test]
    fn test_get_pool_info() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _, _, _) = setup_pool_with_sac(&env);

        let info = client.get_pool_info();
        assert_eq!(info.usdc_reserve, 0);
        assert_eq!(info.eurc_reserve, 0);
        assert_eq!(info.current_rate, 9_200_000);
        assert_eq!(info.rate_denominator, 10_000_000);
        assert_eq!(info.total_deposits, 0);
        assert_eq!(info.current_root, client.get_root());
    }

    #[test]
    fn test_withdraw_with_recent_rate_after_update() {
        let env = Env::default();
        env.mock_all_auths();
        env.cost_estimate().budget().reset_unlimited();

        let admin = Address::generate(&env);
        let depositor = Address::generate(&env);
        let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
        let usdc_addr = usdc_sac.address();
        let eurc_addr = eurc_sac.address();
        
        let verifier = env.register(ultrahonk_verifier::UltraHonkVerifierContract, ());
        
        let contract_id = env.register(ZendSwapPool, ());
        let client = ZendSwapPoolClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc_addr, &eurc_addr, &verifier, &9200000, &10000000);
        
        soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor, &1_000_000_000);
        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor, &1_000_000_000);
        soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

        let eurc_client = TokenClient::new(&env, &eurc_addr);

        let commitment_bytes: [u8; 32] = [
            0x10, 0x53, 0xdc, 0xa3, 0xa0, 0x15, 0x9d, 0x82,
            0x31, 0xc5, 0x22, 0xb2, 0xb8, 0x12, 0x5e, 0xf5,
            0x9a, 0xe9, 0x32, 0xf1, 0x3f, 0x9a, 0x45, 0xcc,
            0x04, 0xe6, 0xcd, 0x94, 0x8d, 0xc5, 0xc9, 0x1b,
        ];
        let commitment = BytesN::from_array(&env, &commitment_bytes);
        client.deposit(&depositor, &usdc_addr, &500, &commitment);

        let root = client.get_root();

        client.set_rate(&admin, &10_000_000, &10_000_000);
        let (current_num, _) = client.get_rate();
        assert_eq!(current_num, 10_000_000);

        const STATIC_PROOF: &[u8] = include_bytes!("../../ultrahonk-verifier/static_proof.proof");
        let proof = Bytes::from_slice(&env, STATIC_PROOF);

        let recipient = Address::generate(&env);
        let nullifier_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c,
            0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11, 0xd4, 0xc3,
            0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48,
            0xe6, 0x91, 0x13, 0xb4, 0x35, 0x07, 0xda, 0xf8,
        ];
        let nullifier_hash = BytesN::from_array(&env, &nullifier_bytes);

        assert_eq!(eurc_client.balance(&recipient), 0);

        client.withdraw(
            &recipient,
            &eurc_addr,
            &proof,
            &nullifier_hash,
            &root,
            &460,
        );

        assert_eq!(eurc_client.balance(&recipient), 460);
    }
}
