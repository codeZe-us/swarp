import { StateCreator } from 'zustand';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { isConnected } from '@stellar/freighter-api';
import { StoreState } from '../useStore';
import { connectWallet, disconnectWallet, initKit, isValidPublicKey } from '../../lib/stellar';

export interface WalletSlice {
  address: string | null;
  network: 'testnet' | 'mainnet';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  kit: typeof StellarWalletsKit | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setNetwork: (network: 'testnet' | 'mainnet') => void;
  autoReconnect: () => Promise<void>;
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
      const { address } = await connectWallet();
      set({ address, status: 'connected', error: null, kit: StellarWalletsKit });
      
      await get().loadNotes(address);
      get().loadTransactions(address);
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to connect wallet';
      set({ status: 'error', error: errorMsg });
      throw err;
    }
  },
  disconnect: async () => {
    try {
      await disconnectWallet();
    } catch (e) {
      console.warn('Disconnection error:', e);
    }
    set({ address: null, status: 'disconnected', error: null, kit: null });
    get().clearNotes();
    get().clearTransactions();
  },
  setNetwork: (network) => {
    set({ network });
    try {
      const walletNetwork = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
      StellarWalletsKit.setNetwork(walletNetwork);
    } catch (e) {
      console.warn('Failed to set network on kit:', e);
    }
  },
  autoReconnect: async () => {
    if (typeof window === 'undefined') return;
    const lastWalletId = localStorage.getItem('walletId');
    if (!lastWalletId) return;

    try {
      // If Freighter was connected, check if it's still present/unlocked
      if (lastWalletId === 'freighter') {
        const { isConnected: freighterConnected } = await isConnected();
        if (!freighterConnected) {
          localStorage.removeItem('walletId');
          set({ status: 'disconnected', address: null, kit: null });
          return;
        }
      }

      initKit();
      StellarWalletsKit.setWallet(lastWalletId);
      const { address } = await StellarWalletsKit.fetchAddress();
      if (address && isValidPublicKey(address)) {
        set({ address, status: 'connected', error: null, kit: StellarWalletsKit });
        await get().loadNotes(address);
        get().loadTransactions(address);
      } else {
        localStorage.removeItem('walletId');
      }
    } catch (e) {
      console.warn('Silent auto-reconnect failed:', e);
      localStorage.removeItem('walletId');
      set({ address: null, status: 'disconnected', error: null, kit: null });
    }
  },
});
