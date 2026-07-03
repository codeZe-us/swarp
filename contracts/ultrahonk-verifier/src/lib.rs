#![no_std]

extern crate alloc;
#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, PROOF_BYTES};





const VK_BYTES: &[u8] = include_bytes!("../vk");






#[contract]
pub struct UltraHonkVerifierContract;

#[contractimpl]
impl UltraHonkVerifierContract {
    
    
    
    
    
    
    
    
    
    
    
    pub fn verify(
        env: Env,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
    ) -> bool {
        if proof.len() as usize != PROOF_BYTES {
            return false;
        }

        if public_inputs.len() != 6 {
            return false;
        }



        
        
        let asset_in = public_inputs.get(0).unwrap();
        let exchange_rate = public_inputs.get(1).unwrap();
        let rate_denominator = public_inputs.get(2).unwrap();
        let nullifier_hash = public_inputs.get(3).unwrap();
        let asset_out_public = public_inputs.get(4).unwrap();
        let merkle_root = public_inputs.get(5).unwrap();

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

    
    pub fn vk_bytes(env: Env) -> Bytes {
        if VK_BYTES.len() < 1760 {
            Bytes::new(&env)
        } else {
            Bytes::from_slice(&env, &VK_BYTES[..1760])
        }
    }

    
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

        let pi_0: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_0));

        let pi_1: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xe8,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_1));

        let pi_2: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xe8,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_2));

        let pi_3: [u8; 32] = [
            0x1f, 0x19, 0xa2, 0xb2, 0x9c, 0x09, 0x3f, 0xfe,
            0x45, 0x96, 0xda, 0x1b, 0xe4, 0x0a, 0x0d, 0x82,
            0x6b, 0x5d, 0x1a, 0x8b, 0xaf, 0xa7, 0x16, 0xb0,
            0x14, 0xb0, 0xf2, 0x52, 0x80, 0xfe, 0x48, 0x9f,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_3));

        let pi_4: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_4));

        let pi_5: [u8; 32] = [
            0x2d, 0x56, 0x53, 0x8f, 0xa9, 0x66, 0xfd, 0xfc,
            0xe9, 0xee, 0x6d, 0x48, 0x0e, 0x45, 0x85, 0xfd,
            0x6f, 0xbd, 0xe5, 0x85, 0x52, 0xf6, 0xa9, 0x52,
            0xaa, 0x0f, 0xfb, 0xe5, 0x2d, 0x11, 0x0f, 0xb0,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_5));

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

        let pi_0: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_0));

        let pi_1: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xe8,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_1));

        let pi_2: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xe9, // Modified byte to ensure failure
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_2));

        let pi_3: [u8; 32] = [
            0x1f, 0x19, 0xa2, 0xb2, 0x9c, 0x09, 0x3f, 0xfe,
            0x45, 0x96, 0xda, 0x1b, 0xe4, 0x0a, 0x0d, 0x82,
            0x6b, 0x5d, 0x1a, 0x8b, 0xaf, 0xa7, 0x16, 0xb0,
            0x14, 0xb0, 0xf2, 0x52, 0x80, 0xfe, 0x48, 0x9f,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_3));

        let pi_4: [u8; 32] = [
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_4));

        let pi_5: [u8; 32] = [
            0x2d, 0x56, 0x53, 0x8f, 0xa9, 0x66, 0xfd, 0xfc,
            0xe9, 0xee, 0x6d, 0x48, 0x0e, 0x45, 0x85, 0xfd,
            0x6f, 0xbd, 0xe5, 0x85, 0x52, 0xf6, 0xa9, 0x52,
            0xaa, 0x0f, 0xfb, 0xe5, 0x2d, 0x11, 0x0f, 0xb0,
        ];
        public_inputs.push_back(BytesN::from_array(&env, &pi_5));

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
