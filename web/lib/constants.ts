// Stellar testnet configuration and contract addresses

export const STELLAR_HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

export const STELLAR_NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ||
  'Testnet Public Stellar Network ; September 2015';

// Deployed contract IDs (can be set in .env / .env.local)
export const POOL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_SWARP_CONTRACT_ID || // standard contract ID matching .env
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ||
  'CBC4DNL77PU5BNTXC6APQE46FU5JDY72OOTKGHRVUTCCAT6RNLLLYDYS';

export const VERIFIER_CONTRACT_ID =
  process.env.NEXT_PUBLIC_VERIFIER_CONTRACT_ID || 'CAMZZMFIPURXP2ZDION6K3RN62ORU3MHE6GWT6JB2OXPB4WOYNTJA2VZ';

// Token Stellar Asset Contract (SAC) addresses
export const USDC_SAC_ID = process.env.NEXT_PUBLIC_USDC_SAC_ID || 'CDTGDHE3GHSNIYMRHBN7PMSGXXR73KHZ4KS2ZEBAIDOS6THPOLMHL5LG';
export const EURC_SAC_ID = process.env.NEXT_PUBLIC_EURC_SAC_ID || 'CD6KJAOC4OQ2LQC4WQZHUFW2SMINOPC6SXUOCKN5UAX2KHVBSXUXQIDG';

// Initial exchange rate: 0.92 USDC to EURC (9,200,000 / 10,000,000)
export const INITIAL_RATE_NUMERATOR = 9200000;
export const INITIAL_RATE_DENOMINATOR = 10000000;

// Merkle Tree Depth
export const MERKLE_TREE_DEPTH = 20;
