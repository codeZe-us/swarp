#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Env, Address, Bytes, BytesN, Vec};

fn setup_integration_test(
    env: &Env,
) -> (
    ZendSwapPoolClient<'_>,
    Address, // usdc_addr
    Address, // eurc_addr
    Address, // depositor
    Address, // pool contract_id
    Address, // admin
) {
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
    
    // Mint initial balances to depositor
    soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr).mint(&depositor, &1_000_000_000);
    
    // Fund pool with reserves (both USDC and EURC)
    soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr).mint(&contract_id, &10_000_000);
    soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr).mint(&contract_id, &10_000_000);
    
    (client, usdc_addr, eurc_addr, depositor, contract_id, admin)
}

#[test]
fn test_integration_usdc_to_eurc_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, contract_id, _) =
        setup_integration_test(&env);

    let usdc_client = TokenClient::new(&env, &usdc_addr);
    let eurc_client = TokenClient::new(&env, &eurc_addr);

    let initial_depositor_usdc = usdc_client.balance(&depositor);
    let initial_pool_usdc = usdc_client.balance(&contract_id);
    let initial_pool_eurc = eurc_client.balance(&contract_id);

    // 1. Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);

    // 2. Reconstruct Merkle root from on-chain state
    let expected_root = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_ROOT);
    assert_eq!(client.get_root(), expected_root);

    // 3. Withdraw EURC (460)
    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &eurc_addr,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );

    // 4. Verify balances
    assert_eq!(usdc_client.balance(&depositor), initial_depositor_usdc - 500);
    assert_eq!(eurc_client.balance(&recipient), 460);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc + 500);
    assert_eq!(eurc_client.balance(&contract_id), initial_pool_eurc - 460);

    // 5. Verify nullifier marked as spent
    let res = client.try_withdraw(
        &recipient,
        &eurc_addr,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );
    assert!(res.is_err());
}

#[test]
fn test_integration_eurc_to_usdc_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, contract_id, _) =
        setup_integration_test(&env);

    let usdc_client = TokenClient::new(&env, &usdc_addr);
    let eurc_client = TokenClient::new(&env, &eurc_addr);

    let initial_depositor_eurc = eurc_client.balance(&depositor);
    let initial_pool_usdc = usdc_client.balance(&contract_id);
    let initial_pool_eurc = eurc_client.balance(&contract_id);

    // 1. Deposit EURC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_COMMITMENT);
    client.deposit(&depositor, &eurc_addr, &500, &commitment);

    // 2. Reconstruct Merkle root
    let expected_root = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_ROOT);
    assert_eq!(client.get_root(), expected_root);

    // 3. Withdraw USDC (460)
    let proof = Bytes::from_slice(&env, test_fixtures::EURC_TO_USDC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &usdc_addr,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );

    // 4. Verify balances
    assert_eq!(eurc_client.balance(&depositor), initial_depositor_eurc - 500);
    assert_eq!(usdc_client.balance(&recipient), 460);
    assert_eq!(eurc_client.balance(&contract_id), initial_pool_eurc + 500);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc - 460);

    // 5. Verify nullifier spent
    let res = client.try_withdraw(
        &recipient,
        &usdc_addr,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );
    assert!(res.is_err());
}

#[test]
fn test_integration_multiple_users_isolation() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    // Setup Pool A
    let (client_a, usdc_addr, eurc_addr, depositor_a, _contract_a, _) =
        setup_integration_test(&env);

    // Setup Pool B
    let verifier = env.register(ultrahonk_verifier::UltraHonkVerifierContract, ());
    let admin_b = Address::generate(&env);
    let contract_b = env.register(ZendSwapPool, ());
    let client_b = ZendSwapPoolClient::new(&env, &contract_b);
    client_b.initialize(&admin_b, &usdc_addr, &eurc_addr, &verifier, &9200000, &10000000);
    
    let depositor_b = Address::generate(&env);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor_b, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor_b, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_b, &10_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&contract_b, &10_000_000);

    // 1. User A deposits USDC in Pool A
    let commitment_a = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client_a.deposit(&depositor_a, &usdc_addr, &500, &commitment_a);
    let root_a = client_a.get_root();

    // 2. User B deposits EURC in Pool B
    let commitment_b = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_COMMITMENT);
    client_b.deposit(&depositor_b, &eurc_addr, &500, &commitment_b);
    let root_b = client_b.get_root();

    // 3. User A withdraws from Pool A
    let proof_a = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_a = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient_a = Address::generate(&env);

    client_a.withdraw(
        &recipient_a,
        &eurc_addr,
        &proof_a,
        &nullifier_a,
        &root_a,
        &460,
    );

    // 4. User B withdraws from Pool B
    let proof_b = Bytes::from_slice(&env, test_fixtures::EURC_TO_USDC_PROOF);
    let nullifier_b = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_NULLIFIER);
    let recipient_b = Address::generate(&env);

    client_b.withdraw(
        &recipient_b,
        &usdc_addr,
        &proof_b,
        &nullifier_b,
        &root_b,
        &460,
    );

    // Verify balances
    let eurc_client = TokenClient::new(&env, &eurc_addr);
    let usdc_client = TokenClient::new(&env, &usdc_addr);
    assert_eq!(eurc_client.balance(&recipient_a), 460);
    assert_eq!(usdc_client.balance(&recipient_b), 460);
}

#[test]
fn test_integration_double_spend_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, _) = setup_integration_test(&env);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    // First withdraw works
    client.withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);

    // Second withdraw fails with NullifierSpent
    let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}

#[test]
fn test_integration_wrong_merkle_root_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, _) = setup_integration_test(&env);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);
    
    // Pass a fake root
    let fake_root = BytesN::from_array(&env, &[0xAA; 32]);

    let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &fake_root, &460);
    assert!(res.is_err());
}

#[test]
fn test_integration_wrong_rate_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, admin) = setup_integration_test(&env);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);
    let root = client.get_root();

    // Admin updates the rate to 10_000_000
    client.set_rate(&admin, &10_000_000, &10_000_000);
    
    // Push the old rate out of the buffer by updating it 11 times
    for _ in 0..11 {
        client.set_rate(&admin, &10_000_000, &10_000_000);
    }

    let current_rates: Vec<u64> = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::RecentRates).unwrap()
    });
    std::println!("current_rates in test: {:?}", current_rates);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    // This should fail because the rate 9_200_000 is no longer in the rate history buffer!
    let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}

#[contract]
pub struct WrongVerifierMock;

#[contractimpl]
impl WrongVerifierMock {
    pub fn verify(
        _env: Env,
        _proof: Bytes,
        _public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        false
    }
}

#[test]
fn test_integration_wrong_verification_key_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let admin = Address::generate(&env);
    let depositor = Address::generate(&env);
    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = usdc_sac.address();
    let eurc_addr = eurc_sac.address();
    
    // Deploy WRONG verifier contract
    let wrong_verifier = env.register(WrongVerifierMock, ());
    
    let contract_id = env.register(ZendSwapPool, ());
    let client = ZendSwapPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &usdc_addr, &eurc_addr, &wrong_verifier, &9200000, &10000000);
    
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    // Verification fails because the verifier is a wrong circuit mock
    let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}

#[test]
fn test_integration_insufficient_pool_reserves_fails() {
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
    
    // Mint ONLY 400 EURC to the pool (less than 460 required for withdrawal!)
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &400);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    // Withdraw fails because pool does not have enough reserves
    let res = client.try_withdraw(&recipient, &eurc_addr, &proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}

#[test]
#[should_panic(expected = "unsupported token")]
fn test_integration_deposit_unsupported_token_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _, depositor, _, _) = setup_integration_test(&env);
    
    let fake_token = Address::generate(&env);
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    
    client.deposit(&depositor, &fake_token, &500, &commitment);
}

#[test]
fn test_integration_garbage_proof_fails_no_panic() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, _) = setup_integration_test(&env);

    // Deposit USDC (500)
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &usdc_addr, &500, &commitment);
    let root = client.get_root();

    let garbage_proof = Bytes::from_slice(&env, &[0u8; 14592]);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    // This should fail gracefully with an Error rather than panicking
    let res = client.try_withdraw(&recipient, &eurc_addr, &garbage_proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}
