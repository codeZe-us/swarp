import { StateCreator } from 'zustand';
import { StoreState } from '../useStore';

export interface PoolSlice {
  merkleRoot: string;
  exchangeRate: { numerator: number; denominator: number };
  usdcReserves: string;
  eurcReserves: string;
  totalDeposits: number;
  commitments: string[];
  fetchPoolState: () => Promise<void>;
  fetchCommitments: () => Promise<void>;
}

const isBrowser = typeof window !== 'undefined';

const getInitialPoolState = () => {
  if (isBrowser) {
    const saved = localStorage.getItem('swarp_pool_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Ignore
      }
    }
  }
  return {
    merkleRoot: '0',
    exchangeRate: { numerator: 1, denominator: 1 },
    usdcReserves: '0',
    eurcReserves: '0',
    totalDeposits: 0,
  };
};

const getInitialCommitments = () => {
  if (isBrowser) {
    const saved = localStorage.getItem('swarp_pool_commitments');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Ignore
      }
    }
  }
  return [];
};

export const createPoolSlice: StateCreator<
  StoreState,
  [],
  [],
  PoolSlice
> = (set) => {
  const initialPoolState = getInitialPoolState();
  const initialCommitments = getInitialCommitments();

  return {
    merkleRoot: initialPoolState.merkleRoot,
    exchangeRate: initialPoolState.exchangeRate,
    usdcReserves: initialPoolState.usdcReserves,
    eurcReserves: initialPoolState.eurcReserves,
    totalDeposits: initialPoolState.totalDeposits,
    commitments: initialCommitments,
    fetchPoolState: async () => {
      try {
        const mockState = {
          merkleRoot: '0x2d9a6c8e3f4b5a7d8c9e0f1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u',
          exchangeRate: { numerator: 101, denominator: 100 },
          usdcReserves: '1000000',
          eurcReserves: '850000',
          totalDeposits: 42,
        };
        set(mockState);
        if (isBrowser) {
          localStorage.setItem('swarp_pool_state', JSON.stringify(mockState));
        }
      } catch (error) {
        console.error('Failed to fetch pool state:', error);
      }
    },
    fetchCommitments: async () => {
      try {
        const mockCommitments = [
          '0x1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f',
          '0x2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8a9b0c1d2e3f',
        ];
        set({ commitments: mockCommitments });
        if (isBrowser) {
          localStorage.setItem('swarp_pool_commitments', JSON.stringify(mockCommitments));
        }
      } catch (error) {
        console.error('Failed to fetch commitments:', error);
      }
    },
  };
};
