import { StateCreator } from 'zustand';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { Networks } from '@creit.tech/stellar-wallets-kit';
import { isConnected, getNetworkDetails } from '@stellar/freighter-api';
import { StoreState } from '../useStore';
import { connectWallet, disconnectWallet, initKit, isValidPublicKey } from '../../lib/stellar';
import { ZendSwapError, handleError } from '../../lib/errors';
import { useToastStore } from '../useToast';

export interface WalletSlice {
  address: string | null;
  network: 'testnet' | 'mainnet';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: ZendSwapError | null;
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
      const { address, walletId } = await connectWallet();

        if (typeof window !== 'undefined') {
        try {
          let netName = '';
          if (walletId === 'freighter') {
            const fNetwork = await getNetworkDetails();
            netName = (fNetwork?.network || '').toLowerCase();
          } else {
            try {
              const networkDetails = await StellarWalletsKit.getNetwork();
              netName = (networkDetails?.network || '').toLowerCase();
            } catch (err: any) {
              console.warn('StellarWalletsKit getNetwork failed, bypassing check for this wallet', err);
            }
          }
          
          if (netName === 'public' || netName.includes('mainnet')) {
            await disconnectWallet();
            throw new ZendSwapError({
              code: 'WALLET_WRONG_NETWORK',
              title: 'Mainnet Detected',
              message: 'You are currently connected to the Stellar Mainnet. We are currently working with Testnet. Please switch your wallet network to Testnet.',
              severity: 'error',
              source: 'wallet'
            });
          } else {
             useToastStore.getState().addToast({
              title: 'Wallet Connected',
              message: 'Successfully connected to Testnet.',
              severity: 'success',
              duration: 3000,
            });
          }
        } catch (e) {
          if (e instanceof ZendSwapError) throw e;
          console.warn('Could not fetch network details', e);
        }
      }

      set({ address, status: 'connected', error: null, kit: StellarWalletsKit });

            await get().loadNotes(address);
      get().loadTransactions(address);
      await get().loadPayroll(address);
      await get().loadTeam(address);
    } catch (err: unknown) {
      const zError = handleError(err, 'wallet_connect');
      set({ status: 'error', error: zError });
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
    get().clearPayroll();
    get().clearTeam();
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
        await get().loadPayroll(address);
        await get().loadTeam(address);
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
