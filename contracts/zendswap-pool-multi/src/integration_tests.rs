#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Env, Address, Bytes, BytesN, Vec};

fn setup_integration_test(
    env: &Env,
    use_real_verifier: bool,
) -> (
    ZendSwapPoolClient<'_>,
    Vec<Address>,
    Address,
    Address,
    Address,
) {
    let admin = Address::generate(env);
    let depositor = Address::generate(env);
    let mut assets = Vec::new(env);
    for _ in 0..5 {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        assets.push_back(sac.address());
    }
    let verifier = if use_real_verifier {
        env.register(ultrahonk_verifier_multi::UltraHonkVerifierContract, ())
    } else {
        env.register(mock_verifier::MockVerifier, ())
    };
    
    let contract_id = env.register(ZendSwapPool, ());
    let client = ZendSwapPoolClient::new(env, &contract_id);
    
    client.initialize(&admin, &assets, &verifier, &10000000, &10000000);
    client.set_rate(&admin, &0, &1, &9200000, &10000000);
    client.set_rate(&admin, &1, &0, &10860000, &10000000);
    client.set_rate(&admin, &0, &2, &10000000, &10000000);
    client.set_rate(&admin, &2, &0, &10000000, &10000000);
    client.set_rate(&admin, &0, &3, &9500000, &10000000);
    client.set_rate(&admin, &3, &0, &10520000, &10000000);
    client.set_rate(&admin, &0, &4, &12500000, &10000000);
    client.set_rate(&admin, &4, &0, &800000, &10000000);
    client.set_rate(&admin, &2, &4, &12500000, &10000000);
    client.set_rate(&admin, &4, &2, &800000, &10000000);
    
    for i in 0..5 {
        soroban_sdk::token::StellarAssetClient::new(env, &assets.get(i).unwrap()).mint(&depositor, &1_000_000_000);
        soroban_sdk::token::StellarAssetClient::new(env, &assets.get(i).unwrap()).mint(&contract_id, &10_000_000);
    }
    
    (client, assets, depositor, contract_id, admin)
}

#[test]
fn test_integration_usdc_to_eurc_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.budget().reset_unlimited();
    env.budget().reset_default();
    // env.budget().set_limits(u64::MAX, u64::MAX);

    let (client, assets, depositor, contract_id, _) =
        setup_integration_test(&env, false);

    let usdc_addr = assets.get(0).unwrap();
    let eurc_addr = assets.get(1).unwrap();

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
    env.budget().reset_unlimited();

    let (client, assets, depositor, contract_id, _) =
        setup_integration_test(&env, false);

    let usdc_addr = assets.get(0).unwrap();
    let eurc_addr = assets.get(1).unwrap();

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
    env.budget().reset_unlimited();

    let (client_a, assets_a, depositor_a, _contract_a, _) =
        setup_integration_test(&env, false);
    let usdc_addr = assets_a.get(0).unwrap();
    let eurc_addr = assets_a.get(1).unwrap();
    let verifier = env.register(mock_verifier::MockVerifier, ());
    let admin_b = Address::generate(&env);
    let contract_b = env.register(ZendSwapPool, ());
    let client_b = ZendSwapPoolClient::new(&env, &contract_b);
    client_b.initialize(&admin_b, &assets_a, &verifier, &10000000, &10000000);
    client_b.set_rate(&admin_b, &0, &1, &9200000, &10000000);
    client_b.set_rate(&admin_b, &1, &0, &10860000, &10000000);
    
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
    env.budget().reset_unlimited();

    let (client, assets, depositor, _, _) = setup_integration_test(&env, false);
    let _usdc_addr = assets.get(0).unwrap();
    let _eurc_addr = assets.get(1).unwrap();

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
    env.budget().reset_unlimited();

    let (client, assets, depositor, _, _) = setup_integration_test(&env, false);
    let _usdc_addr = assets.get(0).unwrap();
    let _eurc_addr = assets.get(1).unwrap();

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
    env.budget().reset_unlimited();

    let (client, _, depositor, _, admin) = setup_integration_test(&env, true);

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
    env.budget().reset_unlimited();

    let admin = Address::generate(&env);
    let depositor = Address::generate(&env);
    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = usdc_sac.address();
    let eurc_addr = eurc_sac.address();
    
    let wrong_verifier = env.register(WrongVerifierMock, ());
    
    let contract_id = env.register(ZendSwapPool, ());
    let client = ZendSwapPoolClient::new(&env, &contract_id);
    let mut assets = Vec::new(&env);
    assets.push_back(usdc_addr.clone());
    assets.push_back(eurc_addr.clone());
    client.initialize(&admin, &assets, &wrong_verifier, &10000000, &10000000);
    client.set_rate(&admin, &0, &1, &9200000, &10000000);
    client.set_rate(&admin, &1, &0, &10860000, &10000000);
    
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
    env.budget().reset_unlimited();

    let admin = Address::generate(&env);
    let depositor = Address::generate(&env);
    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let eurc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = usdc_sac.address();
    let eurc_addr = eurc_sac.address();
    let verifier = env.register(mock_verifier::MockVerifier, ());
    
    let contract_id = env.register(ZendSwapPool, ());
    let client = ZendSwapPoolClient::new(&env, &contract_id);
    let mut assets = Vec::new(&env);
    assets.push_back(usdc_addr.clone());
    assets.push_back(eurc_addr.clone());
    client.initialize(&admin, &assets, &verifier, &10000000, &10000000);
    client.set_rate(&admin, &0, &1, &9200000, &10000000);
    client.set_rate(&admin, &1, &0, &10860000, &10000000);
    
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

    let (client, _, _, depositor, _) = setup_integration_test(&env, false);
    
    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_EURC_COMMITMENT);
    
    client.deposit(&depositor, &99, &500, &commitment);
}

#[test]
fn test_integration_garbage_proof_fails_no_panic() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.budget().reset_unlimited();

    let (client, _, depositor, _, _) = setup_integration_test(&env, false);

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

#[test]
fn test_integration_usdc_to_mgusd_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.budget().reset_unlimited();

    let (client, assets, depositor, contract_id, _) = setup_integration_test(&env, false);
    let usdc_addr = assets.get(0).unwrap();
    let mgusd_addr = assets.get(2).unwrap();

    let usdc_client = TokenClient::new(&env, &usdc_addr);
    let mgusd_client = TokenClient::new(&env, &mgusd_addr);

    let initial_depositor_usdc = usdc_client.balance(&depositor);
    let initial_pool_usdc = usdc_client.balance(&contract_id);
    let initial_pool_mgusd = mgusd_client.balance(&contract_id);

    let commitment = BytesN::from_array(&env, &test_fixtures::USDC_TO_MGUSD_COMMITMENT);
    client.deposit(&depositor, &0, &500, &commitment);

    let expected_root = BytesN::from_array(&env, &test_fixtures::USDC_TO_MGUSD_ROOT);
    assert_eq!(client.get_root(), expected_root);

    let proof = Bytes::from_slice(&env, test_fixtures::USDC_TO_MGUSD_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::USDC_TO_MGUSD_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &0,
        &2,
        &proof,
        &nullifier_hash,
        &expected_root,
        &500,
    );

    assert_eq!(usdc_client.balance(&depositor), initial_depositor_usdc - 500);
    assert_eq!(mgusd_client.balance(&recipient), 500);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc + 500);
    assert_eq!(mgusd_client.balance(&contract_id), initial_pool_mgusd - 500);
}

#[test]
fn test_integration_xlm_to_usdc_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.budget().reset_unlimited();

    let (client, assets, depositor, contract_id, _) = setup_integration_test(&env, false);
    let xlm_addr = assets.get(4).unwrap();
    let usdc_addr = assets.get(0).unwrap();

    let xlm_client = TokenClient::new(&env, &xlm_addr);
    let usdc_client = TokenClient::new(&env, &usdc_addr);

    let initial_depositor_xlm = xlm_client.balance(&depositor);
    let initial_pool_xlm = xlm_client.balance(&contract_id);
    let initial_pool_usdc = usdc_client.balance(&contract_id);

    let commitment = BytesN::from_array(&env, &test_fixtures::XLM_TO_USDC_COMMITMENT);
    client.deposit(&depositor, &4, &500, &commitment);

    let expected_root = BytesN::from_array(&env, &test_fixtures::XLM_TO_USDC_ROOT);
    assert_eq!(client.get_root(), expected_root);

    let proof = Bytes::from_slice(&env, test_fixtures::XLM_TO_USDC_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::XLM_TO_USDC_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &4,
        &0,
        &proof,
        &nullifier_hash,
        &expected_root,
        &40,
    );

    assert_eq!(xlm_client.balance(&depositor), initial_depositor_xlm - 500);
    assert_eq!(usdc_client.balance(&recipient), 40);
    assert_eq!(xlm_client.balance(&contract_id), initial_pool_xlm + 500);
    assert_eq!(usdc_client.balance(&contract_id), initial_pool_usdc - 40);
}

#[test]
fn test_integration_mgusd_to_xlm_swap() {
    let env = Env::default();
    env.mock_all_auths();
    env.cost_estimate().budget().reset_unlimited();
    env.budget().reset_unlimited();

    let (client, assets, depositor, contract_id, _) = setup_integration_test(&env, false);
    let mgusd_addr = assets.get(2).unwrap();
    let xlm_addr = assets.get(4).unwrap();

    let mgusd_client = TokenClient::new(&env, &mgusd_addr);
    let xlm_client = TokenClient::new(&env, &xlm_addr);

    let initial_depositor_mgusd = mgusd_client.balance(&depositor);
    let initial_pool_mgusd = mgusd_client.balance(&contract_id);
    let initial_pool_xlm = xlm_client.balance(&contract_id);

    let commitment = BytesN::from_array(&env, &test_fixtures::MGUSD_TO_XLM_COMMITMENT);
    client.deposit(&depositor, &2, &500, &commitment);

    let expected_root = BytesN::from_array(&env, &test_fixtures::MGUSD_TO_XLM_ROOT);
    assert_eq!(client.get_root(), expected_root);

    let proof = Bytes::from_slice(&env, test_fixtures::MGUSD_TO_XLM_PROOF);
    let nullifier_hash = BytesN::from_array(&env, &test_fixtures::MGUSD_TO_XLM_NULLIFIER);
    let recipient = Address::generate(&env);

    client.withdraw(
        &recipient,
        &2,
        &4,
        &proof,
        &nullifier_hash,
        &expected_root,
        &625,
    );

    assert_eq!(mgusd_client.balance(&depositor), initial_depositor_mgusd - 500);
    assert_eq!(xlm_client.balance(&recipient), 625);
    assert_eq!(mgusd_client.balance(&contract_id), initial_pool_mgusd + 500);
    assert_eq!(xlm_client.balance(&contract_id), initial_pool_xlm - 625);
}
