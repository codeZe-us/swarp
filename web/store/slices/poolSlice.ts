import { StateCreator } from 'zustand';
import { StoreState } from '../useStore';
import { getPoolInfo } from '../../lib/contracts';

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

const initialPoolState = {
  merkleRoot: '0',
  exchangeRate: { numerator: 1, denominator: 1 },
  usdcReserves: '0',
  eurcReserves: '0',
  totalDeposits: 0,
};

const initialCommitments: string[] = [];

export const createPoolSlice: StateCreator<
  StoreState,
  [],
  [],
  PoolSlice
> = (set) => {
  return {
    merkleRoot: initialPoolState.merkleRoot,
    exchangeRate: initialPoolState.exchangeRate,
    usdcReserves: initialPoolState.usdcReserves,
    eurcReserves: initialPoolState.eurcReserves,
    totalDeposits: initialPoolState.totalDeposits,
    commitments: initialCommitments,
    fetchPoolState: async () => {
      try {
        const poolInfo = await getPoolInfo();
        const poolState = {
          merkleRoot: poolInfo.currentRoot, // plain 64-char hex, no 0x prefix
          exchangeRate: { 
            numerator: poolInfo.currentRate, 
            denominator: poolInfo.rateDenominator 
          },
          usdcReserves: poolInfo.usdcReserve.toString(),
          eurcReserves: poolInfo.eurcReserve.toString(),
          totalDeposits: poolInfo.totalDeposits,
        };
        set(poolState);
        if (isBrowser) {
          localStorage.setItem('swarp_pool_state', JSON.stringify(poolState));
        }
      } catch (error) {
        console.error('Failed to fetch pool state from contract:', error);
      }
    },
    fetchCommitments: async () => {
      // In a real implementation this would query the contract or an indexer for the commitments
      // For now, we just clear it out since there are no actual deposits yet
      set({ commitments: [] });
    },
  };
};
