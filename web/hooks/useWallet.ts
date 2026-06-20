'use client';

import { useStore } from '../store/useStore';
import { signTransaction } from '../lib/stellar';

export function useWallet() {
  const address = useStore((state) => state.address);
  const status = useStore((state) => state.status);
  const connect = useStore((state) => state.connect);
  const disconnect = useStore((state) => state.disconnect);
  const error = useStore((state) => state.error);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return {
    address,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    signTransaction,
    status,
    error,
  };
}
