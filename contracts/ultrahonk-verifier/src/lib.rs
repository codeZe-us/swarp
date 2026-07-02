#![no_std]

extern crate alloc;
#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, PROOF_BYTES};

// ── Verification Key ─────────────────────────────────────────────────────────
// The Verification Key (VK) is embedded at compile time and is immutable.
// VK is 1764 bytes (with a 4-byte recursive flag at the end). The verifier
// library strictly expects 1760 bytes, so it is sliced accordingly at load.
const VK_BYTES: &[u8] = include_bytes!("../vk");

// ── Point Validation Helpers Removed ──────────────────────────────────────────

// ── Contract ─────────────────────────────────────────────────────────────────

/// On-chain UltraHonk proof verifier for the ZendSwap swap circuit.
#[contract]
pub struct UltraHonkVerifierContract;

#[contractimpl]
impl UltraHonkVerifierContract {
    /// Verify an UltraHonk proof for the ZendSwap swap circuit.
    ///
    /// # Arguments
    ///
    /// * `proof`         – raw proof bytes (must be exactly PROOF_BYTES = 14592 bytes)
    /// * `public_inputs` – 6 public inputs, in the order:
    ///                     [merkle_root, nullifier_hash, exchange_rate,
    ///                      rate_denominator, asset_out_public, asset_in]
    ///
    /// # Returns
    /// `true` on valid proof, `false` on any failure or invalid inputs.
    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        if proof.len() as usize != PROOF_BYTES {
            return false;
        }

        if public_inputs.len() != 6 {
            return false;
        }

        // 4. Reorder public inputs to match the Noir circuit declaration order:
        // Input `public_inputs` has order:
        //   [0] merkle_root
        //   [1] nullifier_hash
        //   [2] exchange_rate
        //   [3] rate_denominator
        //   [4] asset_out_public
        //   [5] asset_in
        //
        // Noir circuit expects declaration order in main.nr:
        //   asset_in, exchange_rate, rate_denominator, nullifier_hash, asset_out_public, merkle_root
        let merkle_root = public_inputs.get(0).unwrap();
        let nullifier_hash = public_inputs.get(1).unwrap();
        let exchange_rate = public_inputs.get(2).unwrap();
        let rate_denominator = public_inputs.get(3).unwrap();
        let asset_out_public = public_inputs.get(4).unwrap();
        let asset_in = public_inputs.get(5).unwrap();

        let mut pi_bytes = Bytes::new(&env);
        pi_bytes.append(&Bytes::from_array(&env, &asset_in.to_array()));
        pi_bytes.append(&Bytes::from_array(&env, &exchange_rate.to_array()));
        pi_bytes.append(&Bytes::from_array(&env, &rate_denominator.to_array()));
        pi_bytes.append(&Bytes::from_array(&env, &nullifier_hash.to_array()));
        pi_bytes.append(&Bytes::from_array(&env, &asset_out_public.to_array()));
        pi_bytes.append(&Bytes::from_array(&env, &merkle_root.to_array()));

        #[cfg(test)]
        {
            let mut hex_str = alloc::string::String::new();
            for b in pi_bytes.to_alloc_vec().iter() {
                use core::fmt::Write;
                write!(&mut hex_str, "{:02x}", b).unwrap();
            }
            std::println!("pi_bytes hex: {}", hex_str);
            std::println!("vk_bytes len: {}", VK_BYTES.len());
            std::println!("proof len: {}", proof.len());
        }

        if VK_BYTES.len() < 1760 {
            return false;
        }
        let vk_bytes_sdk = Bytes::from_slice(&env, &VK_BYTES[..1760]);
        let verifier = match UltraHonkVerifier::new(&env, &vk_bytes_sdk) {
            Ok(v) => v,
            Err(_) => return false,
        };

        match verifier.verify(&env, &proof, &pi_bytes) {
            Ok(_) => true,
            Err(_e) => {
                #[cfg(test)]
                std::println!("verifier.verify failed with: {:?}", _e);
                false
            }
        }
    }

    /// Returns the embedded VK as raw bytes (sliced to 1760 bytes).
    pub fn vk_bytes(env: Env) -> Bytes {
        if VK_BYTES.len() < 1760 {
            Bytes::new(&env)
        } else {
            Bytes::from_slice(&env, &VK_BYTES[..1760])
        }
    }

    /// Returns the expected proof length in bytes.
    pub fn proof_bytes_len(_env: Env) -> u32 {
        PROOF_BYTES as u32
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    const STATIC_PROOF: &[u8] = include_bytes!("../static_proof.proof");

    #[test]
    fn test_verification_success() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();

        let contract_id = env.register(UltraHonkVerifierContract, ());
        let client = UltraHonkVerifierContractClient::new(&env, &contract_id);

        let proof_bytes = Bytes::from_slice(&env, STATIC_PROOF);

        let mut public_inputs = Vec::new(&env);

        // 1. merkle_root: 0x13d5a5935821225211517d91c3b202470ed10537de8b8d7aa765c0f163ab8288
        let merkle_root_bytes: [u8; 32] = [
            0x13, 0xd5, 0xa5, 0x93, 0x58, 0x21, 0x22, 0x52, 0x11, 0x51, 0x7d, 0x91, 0xc3, 0xb2,
            0x02, 0x47, 0x0e, 0xd1, 0x05, 0x37, 0xde, 0x8b, 0x8d, 0x7a, 0xa7, 0x65, 0xc0, 0xf1,
            0x63, 0xab, 0x82, 0x88,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &merkle_root_bytes));

        // 2. nullifier_hash: 0x045e9cf13d3ab92cc27bc4ce8111d4c3278ce84764812648e69113b43507daf8
        let nullifier_hash_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c, 0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11,
            0xd4, 0xc3, 0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48, 0xe6, 0x91, 0x13, 0xb4,
            0x35, 0x07, 0xda, 0xf8,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &nullifier_hash_bytes));

        // 3. exchange_rate: 9200000 (0x8c6180)
        let mut exchange_rate_bytes = [0u8; 32];
        exchange_rate_bytes[29] = 0x8c;
        exchange_rate_bytes[30] = 0x61;
        exchange_rate_bytes[31] = 0x80;
        public_inputs.push_back(BytesN::from_array(&env, &exchange_rate_bytes));

        // 4. rate_denominator: 10000000 (0x989680)
        let mut rate_denominator_bytes = [0u8; 32];
        rate_denominator_bytes[29] = 0x98;
        rate_denominator_bytes[30] = 0x96;
        rate_denominator_bytes[31] = 0x80;
        public_inputs.push_back(BytesN::from_array(&env, &rate_denominator_bytes));

        // 5. asset_out_public: 1
        let mut asset_out_public_bytes = [0u8; 32];
        asset_out_public_bytes[31] = 1;
        public_inputs.push_back(BytesN::from_array(&env, &asset_out_public_bytes));

        // 6. asset_in: 0
        let asset_in_bytes = [0u8; 32];
        // asset_in is 0 in Prover.toml, so it's all zeros
        public_inputs.push_back(BytesN::from_array(&env, &asset_in_bytes));

        let verified = client.verify(&proof_bytes, &public_inputs);
        assert!(verified, "Valid proof failed verification!");
    }

    #[test]
    fn test_verification_failure_modified_public_input() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();

        let contract_id = env.register(UltraHonkVerifierContract, ());
        let client = UltraHonkVerifierContractClient::new(&env, &contract_id);

        let proof_bytes = Bytes::from_slice(&env, STATIC_PROOF);

        let mut public_inputs = Vec::new(&env);

        let merkle_root_bytes: [u8; 32] = [
            0x13, 0xd5, 0xa5, 0x93, 0x58, 0x21, 0x22, 0x52, 0x11, 0x51, 0x7d, 0x91, 0xc3, 0xb2,
            0x02, 0x47, 0x0e, 0xd1, 0x05, 0x37, 0xde, 0x8b, 0x8d, 0x7a, 0xa7, 0x65, 0xc0, 0xf1,
            0x63, 0xab, 0x82, 0x88,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &merkle_root_bytes));

        let nullifier_hash_bytes: [u8; 32] = [
            0x04, 0x5e, 0x9c, 0xf1, 0x3d, 0x3a, 0xb9, 0x2c, 0xc2, 0x7b, 0xc4, 0xce, 0x81, 0x11,
            0xd4, 0xc3, 0x27, 0x8c, 0xe8, 0x47, 0x64, 0x81, 0x26, 0x48, 0xe6, 0x91, 0x13, 0xb4,
            0x35, 0x07, 0xda, 0xf8,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &nullifier_hash_bytes));

        // Modified exchange_rate: 9200001 (0x8c6181)
        let mut exchange_rate_bytes = [0u8; 32];
        exchange_rate_bytes[29] = 0x8c;
        exchange_rate_bytes[30] = 0x61;
        exchange_rate_bytes[31] = 0x81;
        public_inputs.push_back(BytesN::from_array(&env, &exchange_rate_bytes));

        let mut rate_denominator_bytes = [0u8; 32];
        rate_denominator_bytes[29] = 0x98;
        rate_denominator_bytes[30] = 0x96;
        rate_denominator_bytes[31] = 0x80;
        public_inputs.push_back(BytesN::from_array(&env, &rate_denominator_bytes));

        let mut asset_out_public_bytes = [0u8; 32];
        asset_out_public_bytes[31] = 1;
        public_inputs.push_back(BytesN::from_array(&env, &asset_out_public_bytes));

        let asset_in_bytes = [0u8; 32];
        public_inputs.push_back(BytesN::from_array(&env, &asset_in_bytes));

        let verified = client.verify(&proof_bytes, &public_inputs);
        assert!(!verified, "Modified public input should fail verification!");
    }

    #[test]
    fn test_verification_failure_garbage_proof() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();

        let contract_id = env.register(UltraHonkVerifierContract, ());
        let client = UltraHonkVerifierContractClient::new(&env, &contract_id);

        let garbage_proof = Bytes::from_slice(&env, &[0u8; 14592]);

        let mut public_inputs = Vec::new(&env);
        let dummy = BytesN::from_array(&env, &[0u8; 32]);
        for _ in 0..6 {
            public_inputs.push_back(dummy.clone());
        }

        let verified = client.verify(&garbage_proof, &public_inputs);
        assert!(!verified, "Garbage proof should return false, not panic!");
    }
}
