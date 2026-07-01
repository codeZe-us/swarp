import { StateCreator } from 'zustand';
import { StoreState } from '../useStore';

export interface PoolConfig {
  STELLAR_HORIZON_URL: string;
  SOROBAN_RPC_URL: string;
  STELLAR_NETWORK_PASSPHRASE: string;
  POOL_CONTRACT_ID: string;
  VERIFIER_CONTRACT_ID: string;
  USDC_SAC_ID: string;
  EURC_SAC_ID: string;
  MGUSD_SAC_ID: string;
  YLDS_SAC_ID: string;
  XLM_SAC_ID: string;
  USDC_ISSUER_ADDRESS: string;
  EURC_ISSUER_ADDRESS: string;
  MGUSD_ISSUER_ADDRESS: string;
  YLDS_ISSUER_ADDRESS: string;
}

export interface ConfigSlice {
  config: PoolConfig | null;
  isConfigLoaded: boolean;
  configError: string | null;
  fetchConfig: () => Promise<void>;
}

export const createConfigSlice: StateCreator<
  StoreState,
  [],
  [],
  ConfigSlice
> = (set) => ({
  config: null,
  isConfigLoaded: false,
  configError: null,
  fetchConfig: async () => {
    try {
      const response = await fetch('/api/pool/config');
      if (!response.ok) {
        throw new Error('Failed to fetch pool configuration');
      }
      const data: PoolConfig = await response.json();
      set({ config: data, isConfigLoaded: true, configError: null });
    } catch (error: any) {
      console.error('Configuration load error:', error);
      set({ configError: error.message, isConfigLoaded: false });
    }
  },
});
