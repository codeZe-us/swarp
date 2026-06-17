export interface Note {
  id: string;
  amount: string;
  asset: 'USDC' | 'EURC';
  secret: string;
  commitment: string;
  leafIndex: number | null;
  depositTxHash: string;
  withdrawTxHash: string | null;
  status: 'pending' | 'deposited' | 'withdrawn';
  createdAt: number;
}

export interface Transaction {
  type: 'deposit' | 'withdrawal';
  amount: string;
  asset: 'USDC' | 'EURC';
  txHash: string;
  timestamp: number;
  privacy: 'public' | 'private';
}
