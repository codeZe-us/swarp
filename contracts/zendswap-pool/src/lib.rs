#![no_std]


use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct ZendSwapPool;

#[contractimpl]
impl ZendSwapPool {
    pub fn init(_env: Env) {}
}

#[cfg(test)]
mod test_poseidon;


