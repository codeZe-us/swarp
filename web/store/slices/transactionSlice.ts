import { StateCreator } from 'zustand';
import { Transaction } from '../types';
import { StoreState } from '../useStore';

export interface TransactionSlice {
  transactions: Transaction[];
  addTransaction: (tx: Transaction) => void;
  loadTransactions: (address: string) => void;
  clearTransactions: () => void;
}

const isBrowser = typeof window !== 'undefined';

export const createTransactionSlice: StateCreator<
  StoreState,
  [],
  [],
  TransactionSlice
> = (set, get) => ({
  transactions: [],
  addTransaction: (tx) => {
    const address = get().address;
    if (!address) return;

    const updatedTransactions = [tx, ...get().transactions];
    set({ transactions: updatedTransactions });

    if (isBrowser) {
      localStorage.setItem(`swarp_transactions_${address}`, JSON.stringify(updatedTransactions));
    }
  },
  loadTransactions: (address) => {
    if (!isBrowser) {
      set({ transactions: [] });
      return;
    }

    const saved = localStorage.getItem(`swarp_transactions_${address}`);
    if (saved) {
      try {
        set({ transactions: JSON.parse(saved) as Transaction[] });
        return;
      } catch (e) {
      }
    }
    set({ transactions: [] });
  },
  clearTransactions: () => {
    set({ transactions: [] });
  },
});
