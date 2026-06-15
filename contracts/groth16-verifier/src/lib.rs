#![no_std]

// Standard Soroban allocator is managed by soroban-sdk.
// We explicitly import `extern crate alloc` to satisfy memory allocation requirements.
extern crate alloc;

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct Groth16Verifier;

#[contractimpl]
impl Groth16Verifier {
    pub fn verify(_env: Env) {
        // Empty starting point
    }
}
