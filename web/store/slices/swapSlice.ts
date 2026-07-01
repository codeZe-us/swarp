import { StateCreator } from 'zustand';
import { StoreState } from '../useStore';

export interface SwapSlice {
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: string;
  proofStatus: 'idle' | 'generating' | 'success' | 'error';
  proofBytes: string | null;
  isSubmitting: boolean;
  submitStatus: string | null;
  setAssetIn: (asset: string) => void;
  setAssetOut: (asset: string) => void;
  setAmountIn: (amount: string) => void;
  setAmountOut: (amount: string) => void;
  setProofStatus: (status: 'idle' | 'generating' | 'success' | 'error') => void;
  setProofBytes: (bytes: string | null) => void;
  setSubmitting: (submitting: boolean) => void;
  setSubmitStatus: (status: string | null) => void;
  resetSwap: () => void;
}

export const createSwapSlice: StateCreator<
  StoreState,
  [],
  [],
  SwapSlice
> = (set) => ({
  assetIn: 'USDC',
  assetOut: 'EURC',
  amountIn: '',
  amountOut: '',
  proofStatus: 'idle',
  proofBytes: null,
  isSubmitting: false,
  submitStatus: null,
  setAssetIn: (assetIn) => set({ assetIn }),
  setAssetOut: (assetOut) => set({ assetOut }),
  setAmountIn: (amountIn) => set({ amountIn }),
  setAmountOut: (amountOut) => set({ amountOut }),
  setProofStatus: (proofStatus) => set({ proofStatus }),
  setProofBytes: (proofBytes) => set({ proofBytes }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  setSubmitStatus: (submitStatus) => set({ submitStatus }),
  resetSwap: () =>
    set({
      amountIn: '',
      amountOut: '',
      proofStatus: 'idle',
      proofBytes: null,
      isSubmitting: false,
      submitStatus: null,
    }),
});
