import { StateCreator } from 'zustand';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { StoreState } from '../useStore';

export interface WalletSlice {
  address: string | null;
  network: 'testnet' | 'mainnet';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  kit: typeof StellarWalletsKit | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  setNetwork: (network: 'testnet' | 'mainnet') => void;
}

export const createWalletSlice: StateCreator<
  StoreState,
  [],
  [],
  WalletSlice
> = (set, get) => ({
  address: null,
  network: 'testnet',
  status: 'disconnected',
  error: null,
  kit: null,
  connect: async () => {
    set({ status: 'connecting', error: null });
    try {
      const currentNetwork = get().network;
      const walletNetwork = currentNetwork === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
      
      StellarWalletsKit.init({
        network: walletNetwork,
        modules: defaultModules(),
      });
      set({ kit: StellarWalletsKit });

      const { address } = await StellarWalletsKit.authModal();
      set({ address, status: 'connected', error: null });
      
      await get().loadNotes(address);
      get().loadTransactions(address);
    } catch (err: any) {
      set({ status: 'error', error: err?.message || 'Failed to connect wallet' });
      throw err;
    }
  },
  disconnect: () => {
    try {
      StellarWalletsKit.disconnect();
    } catch (e) {
      // Ignore
    }
    set({ address: null, status: 'disconnected', error: null });
    get().clearNotes();
    get().clearTransactions();
  },
  setNetwork: (network) => {
    set({ network });
    try {
      const walletNetwork = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
      StellarWalletsKit.setNetwork(walletNetwork);
    } catch (e) {
      // Ignore
    }
  },
});
