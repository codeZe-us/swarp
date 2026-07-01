#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Env, Address, Bytes, BytesN, Vec};

fn setup_integration_test(
    env: &Env,
) -> (
    ZendSwapPoolClient<'_>,
    Address,
    Address,
    Address,
    Address,
    Address,
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
    
    let mut assets = Vec::new(env);
    assets.push_back(usdc_addr.clone());
    assets.push_back(eurc_addr.clone());
    
    client.initialize(&admin, &assets, &verifier);
    client.set_rate(&admin, &0, &1, &9200000, &10000000);
    client.set_rate(&admin, &1, &0, &10869565, &10000000);
    
    soroban_sdk::token::StellarAssetClient::new(env, &usdc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(env, &eurc_addr).mint(&depositor, &1_000_000_000);
    
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

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);

    let expected_root = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_ROOT);
    assert_eq!(client.get_root(), expected_root);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &0,
        &1,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );

    assert_eq!(usdc_client.balance(&depositor), initial_depositor_usdc - 500);
    assert_eq!(eurc_client.balance(&recipient), 460);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc + 500);
    assert_eq!(eurc_client.balance(&contract_id), initial_pool_eurc - 460);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1,
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

    let commitment = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_COMMITMENT);
    client.deposit(&depositor, &1, &500, &commitment);

    let expected_root = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_ROOT);
    assert_eq!(client.get_root(), expected_root);

    let proof = Bytes::from_slice(&env, test_fixtures::EURC_TO_USDC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &1,
        &0,
        &proof,
        &nullifier_hash,
        &expected_root,
        &460,
    );

    assert_eq!(eurc_client.balance(&depositor), initial_depositor_eurc - 500);
    assert_eq!(usdc_client.balance(&recipient), 460);
    assert_eq!(eurc_client.balance(&contract_id), initial_pool_eurc + 500);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc - 460);

    let res = client.try_withdraw(
        &recipient,
        &1,
        &0,
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

    let (client_a, usdc_addr, eurc_addr, depositor_a, _contract_a, _) =
        setup_integration_test(&env);

    let verifier = env.register(ultrahonk_verifier::UltraHonkVerifierContract, ());
    let admin_b = Address::generate(&env);
    let contract_b = env.register(ZendSwapPool, ());
    let client_b = ZendSwapPoolClient::new(&env, &contract_b);
    let mut assets_b = Vec::new(&env);\n    assets_b.push_back(usdc_addr.clone());\n    assets_b.push_back(eurc_addr.clone());\n    client_b.initialize(&admin_b, &assets_b, &verifier);\n    client_b.set_rate(&admin_b, &0, &1, &9200000, &10000000);\n    client_b.set_rate(&admin_b, &1, &0, &10869565, &10000000);
    
    let depositor_b = Address::generate(&env);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor_b, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor_b, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_b, &10_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&contract_b, &10_000_000);

    let commitment_a = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client_a.deposit(&depositor_a, &0, &500, &commitment_a);
    let root_a = client_a.get_root();

    let commitment_b = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_COMMITMENT);
    client_b.deposit(&depositor_b, &1, &500, &commitment_b);
    let root_b = client_b.get_root();

    let proof_a = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_a = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient_a = Address::generate(&env);

    client_a.withdraw(
        &recipient_a,
        &0,
        &1,
        &proof_a,
        &nullifier_a,
        &root_a,
        &460,
    );

    let proof_b = Bytes::from_slice(&env, test_fixtures::EURC_TO_USDC_PROOF);
    let nullifier_b = BytesN::from_array(&env, &test_fixtures::EURC_TO_USDC_NULLIFIER);
    let recipient_b = Address::generate(&env);

    client_b.withdraw(
        &recipient_b,
        &1,
        &0,
        &proof_b,
        &nullifier_b,
        &root_b,
        &460,
    );

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

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &root, &460);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}

#[test]
fn test_integration_wrong_merkle_root_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, _) = setup_integration_test(&env);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);
    
    let fake_root = BytesN::from_array(&env, &[0xAA; 32]);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &fake_root, &460);
    assert!(res.is_err());
}

#[test]
fn test_integration_wrong_rate_fails() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, admin) = setup_integration_test(&env);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);
    let root = client.get_root();

    client.set_rate(&admin, &0, &1, &10_000_000, &10_000_000);
    
    for _ in 0..11 {
        client.set_rate(&admin, &0, &1, &10_000_000, &10_000_000);
    }

    let current_rates: Vec<u64> = env.as_contract(&client.address, || {
        env.storage().instance().get(&DataKey::RecentRates(0, 1)).unwrap()
    });
    std::println!("current_rates in test: {:?}", current_rates);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &root, &460);
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
    
    let wrong_verifier = env.register(WrongVerifierMock, ());
    
    let contract_id = env.register(ZendSwapPool, ());
    let client = ZendSwapPoolClient::new(&env, &contract_id);
    let mut assets = Vec::new(&env);\n    assets.push_back(usdc_addr.clone());\n    assets.push_back(eurc_addr.clone());\n    client.initialize(&admin, &assets, &wrong_verifier);\n    client.set_rate(&admin, &0, &1, &9200000, &10000000);\n    client.set_rate(&admin, &1, &0, &10869565, &10000000);
    
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &10_000_000);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &root, &460);
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
    let mut assets = Vec::new(&env);\n    assets.push_back(usdc_addr.clone());\n    assets.push_back(eurc_addr.clone());\n    client.initialize(&admin, &assets, &verifier);\n    client.set_rate(&admin, &0, &1, &9200000, &10000000);\n    client.set_rate(&admin, &1, &0, &10869565, &10000000);
    
    soroban_sdk::token::StellarAssetClient::new(&env, &usdc_addr).mint(&depositor, &1_000_000_000);
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&depositor, &1_000_000_000);
    
    soroban_sdk::token::StellarAssetClient::new(&env, &eurc_addr).mint(&contract_id, &400);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);
    let root = client.get_root();

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_EURC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &proof, &nullifier_hash, &root, &460);
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
    
    client.deposit(&depositor, &99, &500, &commitment);
}

#[test]
fn test_integration_garbage_proof_fails_no_panic() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();

    let (client, usdc_addr, eurc_addr, depositor, _, _) = setup_integration_test(&env);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);
    let root = client.get_root();

    let garbage_proof = Bytes::from_slice(&env, &[0u8; 14592]);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_NULLIFIER);
    let recipient = Address::generate(&env);

    let res = client.try_withdraw(
        &recipient,
        &0,
        &1, &garbage_proof, &nullifier_hash, &root, &460);
    assert!(res.is_err());
}
