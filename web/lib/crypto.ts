import { Note, Recipient } from '../store/types';

/**
 * Generates a cryptographically random 252-bit BigInt using window.crypto.getRandomValues.
 * A 252-bit value fits safely inside the BN254 scalar field modulus without overflow.
 */
export function generateSecret(): bigint {
  if (typeof window === 'undefined') {
    throw new Error('generateSecret requires browser context (window.crypto).');
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  let val = BigInt(0);
  for (const byte of bytes) {
    val = (val << BigInt(8)) | BigInt(byte);
  }

  // Mask to 252 bits: (BigInt(1) << BigInt(252)) - BigInt(1)
  const mask = (BigInt(1) << BigInt(252)) - BigInt(1);
  return val & mask;
}

/**
 * Derives a 256-bit AES-GCM key from the wallet public key using PBKDF2.
 * Hackathon Compromise Notice: In production, notes should be encrypted with a key derived
 * from wallet signing (e.g. signMessage) rather than the public key itself (since the public
 * key is publicly known).
 */
async function deriveKey(walletPublicKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(walletPublicKey);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = encoder.encode('ZendSwapNoteSalt');

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a list of Notes using PBKDF2 key derivation and AES-256-GCM.
 */
export async function encryptNotes(notes: Note[], walletPublicKey: string): Promise<string> {
  try {
    const plaintext = JSON.stringify(notes);
    const key = await deriveKey(walletPublicKey);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedPlaintext = encoder.encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedPlaintext
    );

    // Combine IV and Ciphertext: [12-bytes IV][ciphertext...]
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('Notes encryption failed:', err);
    throw new Error('Failed to encrypt notes');
  }
}

/**
 * Decrypts a list of Notes using PBKDF2 key derivation and AES-256-GCM.
 */
export async function decryptNotes(encrypted: string, walletPublicKey: string): Promise<Note[]> {
  try {
    const key = await deriveKey(walletPublicKey);
    const binary = atob(encrypted);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decrypted);
    return JSON.parse(plaintext) as Note[];
  } catch (err) {
    console.error('Notes decryption failed:', err);
    throw new Error('Failed to decrypt notes');
  }
}

/**
 * Encrypts a list of Recipients using PBKDF2 key derivation and AES-256-GCM.
 */
export async function encryptRecipients(recipients: Recipient[], walletPublicKey: string): Promise<string> {
  try {
    const plaintext = JSON.stringify(recipients);
    const key = await deriveKey(walletPublicKey);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedPlaintext = encoder.encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedPlaintext
    );

    // Combine IV and Ciphertext: [12-bytes IV][ciphertext...]
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (err) {
    console.error('Recipients encryption failed:', err);
    throw new Error('Failed to encrypt recipients');
  }
}

/**
 * Decrypts a list of Recipients using PBKDF2 key derivation and AES-256-GCM.
 */
export async function decryptRecipients(encrypted: string, walletPublicKey: string): Promise<Recipient[]> {
  try {
    const key = await deriveKey(walletPublicKey);
    const binary = atob(encrypted);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decrypted);
    return JSON.parse(plaintext) as Recipient[];
  } catch (err) {
    console.error('Recipients decryption failed:', err);
    throw new Error('Failed to decrypt recipients');
  }
}
