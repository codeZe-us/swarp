// Simple ECIES encryption utility simulating the Confidential Token selective disclosure using NaCl/Ed25519 conversion
import { Keypair } from '@stellar/stellar-sdk';
import nacl from 'tweetnacl';

export interface DisclosurePayload {
  version: string;
  txHash: string;
  depositAmount: string;
  withdrawAmount: string;
  assetInId: string;
  assetOutId: string;
  timestamp: number;
}

export interface EncryptedDisclosure {
  ephemeralPublicKey: string; // hex
  nonce: string; // hex
  ciphertext: string; // hex
}

// Convert Stellar Ed25519 Public Key to X25519 Public Key for encryption
function getX25519PublicKey(stellarPublicKey: string): Uint8Array {
  // A true implementation uses proper Ed25519 -> X25519 conversion.
  // We use the raw bytes as a simulated proxy for demo purposes if the library doesn't expose it directly.
  const kp = Keypair.fromPublicKey(stellarPublicKey);
  // TweetNaCl expects 32-byte public keys. The raw public key is 32 bytes.
  return kp.rawPublicKey();
}

// Encrypt payload to a target Stellar Public Key
export function generateDisclosure(
  targetPublicKey: string,
  payload: DisclosurePayload
): string {
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const targetX25519PubKey = getX25519PublicKey(targetPublicKey);
  
  // Generate ephemeral keypair for this encryption
  const ephemeralKeypair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  
  // Encrypt the message
  const ciphertext = nacl.box(
    message,
    nonce,
    targetX25519PubKey,
    ephemeralKeypair.secretKey
  );

  const encryptedData: EncryptedDisclosure = {
    ephemeralPublicKey: Buffer.from(ephemeralKeypair.publicKey).toString('hex'),
    nonce: Buffer.from(nonce).toString('hex'),
    ciphertext: Buffer.from(ciphertext).toString('hex')
  };

  // Return as a base64 string
  return Buffer.from(JSON.stringify(encryptedData)).toString('base64');
}

// Decrypt a disclosure payload if we possess the secret key
export function verifyDisclosure(
  recipientSecretKey: string,
  encryptedBase64: string
): DisclosurePayload | null {
  try {
    const kp = Keypair.fromSecret(recipientSecretKey);
    // Convert recipient Ed25519 secret key to X25519. In a real app we'd use curve25519/ed25519 conversion libs.
    // For the demo we use the raw secret seed.
    const recipientX25519SecretKey = kp.rawSecretKey(); 

    const encryptedData: EncryptedDisclosure = JSON.parse(
      Buffer.from(encryptedBase64, 'base64').toString('utf-8')
    );

    const ciphertext = new Uint8Array(Buffer.from(encryptedData.ciphertext, 'hex'));
    const nonce = new Uint8Array(Buffer.from(encryptedData.nonce, 'hex'));
    const ephemeralPublicKey = new Uint8Array(Buffer.from(encryptedData.ephemeralPublicKey, 'hex'));

    const decryptedBytes = nacl.box.open(
      ciphertext,
      nonce,
      ephemeralPublicKey,
      recipientX25519SecretKey
    );

    if (!decryptedBytes) {
      return null;
    }

    const decryptedString = new TextDecoder().decode(decryptedBytes);
    return JSON.parse(decryptedString) as DisclosurePayload;
  } catch (error) {
    console.error('Failed to decrypt disclosure:', error);
    return null;
  }
}
