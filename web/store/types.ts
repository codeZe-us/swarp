export interface Note {
  id: string;
  amount: string;
  asset: 'USDC' | 'EURC';
  secret: string;
  commitment: string;
  leafIndex: number | null;
  depositTxHash: string | null;
  withdrawTxHash: string | null;
  status: 'created' | 'pending' | 'deposited' | 'withdrawn';
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

export interface Recipient {
  id: string;
  name: string;
  department: string;
  address: string;
  amount: string;
  asset: 'USDC' | 'EURC';
}
