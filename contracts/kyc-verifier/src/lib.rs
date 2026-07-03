#![no_std]

extern crate alloc;
#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contractimpl, Bytes, BytesN, Env, Vec, U256};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, PROOF_BYTES};





const VK_BYTES: &[u8] = include_bytes!("../vk");



fn combine_limbs(lo: &[u8; 32], hi: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[..15].copy_from_slice(&hi[17..]);
    out[15..].copy_from_slice(&lo[15..]);
    out
}

fn add_mod(a: &U256, b: &U256, p: &U256) -> U256 {
    let diff = p.sub(a);
    if diff > *b {
        a.add(b)
    } else {
        a.sub(&p.sub(b))
    }
}

fn mul_mod(env: &Env, a: &U256, b: &U256, p: &U256) -> U256 {
    let mut res = U256::from_u32(env, 0);
    let mut temp_a = a.clone();
    let mut temp_b = b.clone();
    let zero = U256::from_u32(env, 0);
    let two = U256::from_u32(env, 2);

    while temp_b > zero {
        let bit = temp_b.rem_euclid(&two);
        if bit == U256::from_u32(env, 1) {
            res = add_mod(&res, &temp_a, p);
        }
        temp_a = add_mod(&temp_a, &temp_a, p);
        temp_b = temp_b.shr(1);
    }
    res
}

fn is_on_curve(env: &Env, x_bytes: &[u8; 32], y_bytes: &[u8; 32]) -> bool {
    const P_BYTES: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58,
        0x5d, 0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c,
        0xfd, 0x47,
    ];
    let p_bytes_sdk = Bytes::from_slice(env, &P_BYTES);
    let x_bytes_sdk = Bytes::from_slice(env, x_bytes);
    let y_bytes_sdk = Bytes::from_slice(env, y_bytes);

    let p = U256::from_be_bytes(env, &p_bytes_sdk);
    let x = U256::from_be_bytes(env, &x_bytes_sdk);
    let y = U256::from_be_bytes(env, &y_bytes_sdk);

    if x >= p || y >= p {
        return false;
    }

    
    let y_sq = mul_mod(env, &y, &y, &p);

    let x_sq = mul_mod(env, &x, &x, &p);
    let x_cu = mul_mod(env, &x_sq, &x, &p);
    let three = U256::from_u32(env, 3);
    let rhs = add_mod(&x_cu, &three, &p);

    y_sq == rhs
}

fn is_valid_g1_point(env: &Env, x_bytes: &[u8; 32], y_bytes: &[u8; 32]) -> bool {
    let mut is_inf = true;
    for &b in x_bytes.iter() {
        if b != 0 {
            is_inf = false;
            break;
        }
    }
    if is_inf {
        for &b in y_bytes.iter() {
            if b != 0 {
                is_inf = false;
                break;
            }
        }
    }
    if is_inf {
        return true;
    }

    is_on_curve(env, x_bytes, y_bytes)
}

fn validate_proof_g1_points(env: &Env, proof: &Bytes) -> bool {
    let validate_at_offset = |offset: u32| -> bool {
        let mut chunk = [0u8; 128];
        proof
            .slice(offset..offset + 128)
            .copy_into_slice(&mut chunk);

        let x = combine_limbs(
            chunk[0..32].try_into().unwrap(),
            chunk[32..64].try_into().unwrap(),
        );
        let y = combine_limbs(
            chunk[64..96].try_into().unwrap(),
            chunk[96..128].try_into().unwrap(),
        );

        #[cfg(test)]
        std::println!("Offset {}: x = {:x?}, y = {:x?}", offset, x, y);

        let valid = is_valid_g1_point(env, &x, &y);
        #[cfg(test)]
        std::println!("Offset {} valid: {}", offset, valid);
        valid
    };

    
    for i in 0..8 {
        if !validate_at_offset(512 + i * 128) {
            return false;
        }
    }

    
    for i in 0..27 {
        if !validate_at_offset(9984 + i * 128) {
            return false;
        }
    }

    
    for i in 0..2 {
        if !validate_at_offset(14336 + i * 128) {
            return false;
        }
    }

    true
}




#[contract]
pub struct UltraHonkVerifierContract;

#[contractimpl]
impl UltraHonkVerifierContract {
    
    
    
    
    
    
    
    
    
    
    
    pub fn verify(env: Env, proof: Bytes, public_inputs: Vec<BytesN<32>>) -> bool {
        if proof.len() as usize != PROOF_BYTES {
            return false;
        }

        if public_inputs.len() != 6 {
            return false;
        }

        if !validate_proof_g1_points(&env, &proof) {
            return false;
        }

        
        
        
        
        
        
        
        
        
        
        
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

    #[test]
    fn test_verification_fresh_proof() {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();

        let contract_id = env.register(UltraHonkVerifierContract, ());
        let client = UltraHonkVerifierContractClient::new(&env, &contract_id);

        let proof_hex_str = include_str!("../fresh_proof.hex");
        let pi_hex_str = include_str!("../fresh_pi.hex");

        let mut proof_bytes = alloc::vec::Vec::new();
        for i in (0..proof_hex_str.len()).step_by(2) {
            proof_bytes.push(u8::from_str_radix(&proof_hex_str[i..i+2], 16).unwrap());
        }
        let proof = Bytes::from_slice(&env, &proof_bytes);

        let mut pi_bytes = alloc::vec::Vec::new();
        for i in (0..pi_hex_str.len()).step_by(2) {
            pi_bytes.push(u8::from_str_radix(&pi_hex_str[i..i+2], 16).unwrap());
        }

        let mut public_inputs = Vec::new(&env);
        
        
        
        
        
        
        
        
        let get_chunk = |idx: usize| {
            let mut chunk = [0u8; 32];
            chunk.copy_from_slice(&pi_bytes[idx*32..(idx+1)*32]);
            BytesN::from_array(&env, &chunk)
        };

        
        let asset_in = get_chunk(0);
        let exchange_rate = get_chunk(1);
        let rate_denominator = get_chunk(2);
        let nullifier_hash = get_chunk(3);
        let asset_out_public = get_chunk(4);
        let merkle_root = get_chunk(5);

        public_inputs.push_back(merkle_root);
        public_inputs.push_back(nullifier_hash);
        public_inputs.push_back(exchange_rate);
        public_inputs.push_back(rate_denominator);
        public_inputs.push_back(asset_out_public);
        public_inputs.push_back(asset_in);

        let verified = client.verify(&proof, &public_inputs);
        assert!(verified, "Fresh proof should verify!");
    }
}
