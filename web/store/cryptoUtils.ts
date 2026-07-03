import { Note } from './types';

async function deriveKey(address: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const addressBytes = encoder.encode(address);
  const hash = await crypto.subtle.digest('SHA-256', addressBytes);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptNotes(address: string, notes: Note[]): Promise<string> {
  try {
    const plaintext = JSON.stringify(notes);
    const key = await deriveKey(address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedPlaintext = encoder.encode(plaintext);

        const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedPlaintext
    );

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

export async function decryptNotes(address: string, base64Ciphertext: string): Promise<Note[]> {
  try {
    const key = await deriveKey(address);
    const binary = atob(base64Ciphertext);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

        const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

        const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

        const decoder = new TextDecoder();
    const plaintext = decoder.decode(decrypted);
    return JSON.parse(plaintext) as Note[];
  } catch (err) {
    console.error('Notes decryption failed (potentially different wallet):', err);
    throw new Error('Failed to decrypt notes');
  }
}
