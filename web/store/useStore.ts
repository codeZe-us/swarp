import { create } from 'zustand';
import { createWalletSlice, WalletSlice } from './slices/walletSlice';
import { createPoolSlice, PoolSlice } from './slices/poolSlice';
import { createNotesSlice, NotesSlice } from './slices/notesSlice';
import { createSwapSlice, SwapSlice } from './slices/swapSlice';
import { createTransactionSlice, TransactionSlice } from './slices/transactionSlice';

export type StoreState = WalletSlice & PoolSlice & NotesSlice & SwapSlice & TransactionSlice;

export const useStore = create<StoreState>()((...a) => ({
  ...createWalletSlice(...a),
  ...createPoolSlice(...a),
  ...createNotesSlice(...a),
  ...createSwapSlice(...a),
  ...createTransactionSlice(...a),
}));
export type { WalletSlice, PoolSlice, NotesSlice, SwapSlice, TransactionSlice };
