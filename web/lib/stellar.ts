import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { isConnected } from '@stellar/freighter-api';
import { StrKey } from '@stellar/stellar-sdk';

const isBrowser = typeof window !== 'undefined';

export function initKit() {
  if (!isBrowser) return;
  try {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: defaultModules(),
    });
  } catch (e) {
    console.error('Failed to initialize Stellar Wallets Kit:', e);
  }
}

export function isValidPublicKey(publicKey: string): boolean {
  if (!publicKey) return false;
  return StrKey.isValidEd25519PublicKey(publicKey);
}

export async function connectWallet(): Promise<{ address: string; walletId: string }> {
  if (!isBrowser) {
    throw new Error('Wallet connection is only supported in the browser.');
  }

  // Ensure Freighter is installed if they specifically need it,
  // or handle general kit modal connection
  initKit();

  try {
    const result = await StellarWalletsKit.authModal();
    const address = result.address;

    if (!isValidPublicKey(address)) {
      throw new Error('Invalid Stellar public key returned by the connected wallet.');
    }

    // Get the selected wallet ID (productId)
    const walletId = StellarWalletsKit.selectedModule?.productId || 'freighter';
    
    localStorage.setItem('walletId', walletId);

    return { address, walletId };
  } catch (error: any) {
    // If the modal was closed, pass through the clean message
    if (error?.message === 'The user closed the modal.') {
      throw error;
    }
    
    // Explicitly check if Freighter is installed if connection fails
    const { isConnected: freighterConnected } = await isConnected();
    if (!freighterConnected) {
      throw new Error('Freighter wallet is not installed. Please install Freighter to proceed.');
    }

    throw error;
  }
}

export async function disconnectWallet(): Promise<void> {
  if (!isBrowser) return;

  try {
    StellarWalletsKit.disconnect();
  } catch (e) {
    console.warn('Disconnect error:', e);
  }

  localStorage.removeItem('walletId');
}

export async function getPublicKey(): Promise<string> {
  if (!isBrowser) throw new Error('Browser execution required.');

  try {
    const { address } = await StellarWalletsKit.getAddress();
    if (!address || !isValidPublicKey(address)) {
      throw new Error('No valid public address connected.');
    }
    return address;
  } catch (e) {
    throw new Error('No wallet connected.');
  }
}

export async function signTransaction(xdr: string): Promise<string> {
  if (!isBrowser) {
    throw new Error('Signing is only supported in the browser.');
  }

  initKit();

  const lastWalletId = localStorage.getItem('walletId');
  if (lastWalletId) {
    try {
      StellarWalletsKit.setWallet(lastWalletId);
    } catch (e) {
      console.warn('Failed to set connected wallet module:', e);
    }
  }

  const result = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: 'Testnet Public Stellar Network ; September 2015',
  });

  if (!result.signedTxXdr) {
    throw new Error('Transaction signing failed: returned XDR is empty.');
  }

  return result.signedTxXdr;
}
