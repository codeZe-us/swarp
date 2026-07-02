#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Allowed(Address),
}

#[contract]
pub struct OzPolicyEngine;

#[contractimpl]
impl OzPolicyEngine {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn allow(env: Env, account: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Allowed(account), &true);
    }

    pub fn revoke(env: Env, account: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().persistent().remove(&DataKey::Allowed(account));
    }

    /// OpenZeppelin Policy Trait Implementation
    pub fn is_authorized(env: Env, account: Address, _token: Address) -> bool {
        env.storage().persistent().get(&DataKey::Allowed(account)).unwrap_or(false)
    }
}
