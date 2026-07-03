#![no_std]
use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};

#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn verify(_env: Env, proof: Bytes, _public_inputs: Vec<BytesN<32>>) -> bool {
        
        if proof.len() == 14592 {
            let all_zeros = (0..14592).all(|i| proof.get(i).unwrap_or(1) == 0);
            if all_zeros {
                return false;
            }
        }
        true
    }
}
