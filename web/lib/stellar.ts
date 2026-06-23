import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { isConnected } from '@stellar/freighter-api';
import { StrKey, Asset, TransactionBuilder, Operation, BASE_FEE, Horizon } from '@stellar/stellar-sdk';
import { useStore } from '../store/useStore';

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

export async function signTransaction(xdr: string, accountToSign?: string): Promise<string> {
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

  const config = useStore.getState().config;
  const options: any = {
    network: Networks.TESTNET,
    networkPassphrase: config?.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
  };
  if (accountToSign) {
    options.accountToSign = accountToSign;
  }
  
  const result = await StellarWalletsKit.signTransaction(xdr, options);

  if (!result.signedTxXdr) {
    throw new Error('Transaction signing failed: returned XDR is empty.');
  }

  return result.signedTxXdr;
}

export async function addTrustline(assetCode: string, issuerAddress: string): Promise<string> {
  const address = await getPublicKey();
  const config = useStore.getState().config;
  if (!config) throw new Error('Config not loaded');

  const horizon = new Horizon.Server(config.STELLAR_HORIZON_URL);
  const account = await horizon.loadAccount(address);
  const asset = new Asset(assetCode, issuerAddress);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();

  const xdr = tx.toXDR();
  const signedXdr = await signTransaction(xdr);

  // Submit the signed transaction back to Horizon
  const txToSubmit = TransactionBuilder.fromXDR(signedXdr, config.STELLAR_NETWORK_PASSPHRASE) as any;
  const txRecord = await horizon.submitTransaction(txToSubmit);

  if (!txRecord.successful) {
    throw new Error('Failed to submit trustline transaction');
  }

  return txRecord.hash;
}
