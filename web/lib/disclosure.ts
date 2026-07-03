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
  ephemeralPublicKey: string; 
  nonce: string; 
  ciphertext: string; 
}

function getX25519PublicKey(stellarPublicKey: string): Uint8Array {
  const kp = Keypair.fromPublicKey(stellarPublicKey);
  return kp.rawPublicKey();
}

export function generateDisclosure(
  targetPublicKey: string,
  payload: DisclosurePayload
): string {
  const message = new TextEncoder().encode(JSON.stringify(payload));
  const targetX25519PubKey = getX25519PublicKey(targetPublicKey);

  const ephemeralKeypair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

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

  return Buffer.from(JSON.stringify(encryptedData)).toString('base64');
}

export function verifyDisclosure(
  recipientSecretKey: string,
  encryptedBase64: string
): DisclosurePayload | null {
  try {
    const kp = Keypair.fromSecret(recipientSecretKey);
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
