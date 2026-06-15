#![no_std]

extern crate alloc;

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct Groth16Verifier;

#[contractimpl]
impl Groth16Verifier {
    pub fn verify(_env: Env) {}
}

