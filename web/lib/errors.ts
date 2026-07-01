import { useToastStore } from '../store/useToast';

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'silent' | 'catastrophic';
export type ErrorSource = 'wallet' | 'transaction' | 'contract' | 'proof' | 'api' | 'browser' | 'unknown';

export class ZendSwapError extends Error {
  code: string;
  title: string;
  action?: string;
  actionLabel?: string;
  actionHandler?: () => void;
  severity: ErrorSeverity;
  source: ErrorSource;
  rawError?: unknown;

  constructor(params: {
    code: string;
    title: string;
    message: string;
    action?: string;
    actionLabel?: string;
    actionHandler?: () => void;
    severity: ErrorSeverity;
    source: ErrorSource;
    rawError?: unknown;
  }) {
    super(params.message);
    this.name = 'ZendSwapError';
    this.code = params.code;
    this.title = params.title;
    this.action = params.action;
    this.actionLabel = params.actionLabel;
    this.actionHandler = params.actionHandler;
    this.severity = params.severity;
    this.source = params.source;
    this.rawError = params.rawError;
  }
}

// Registry to map raw errors to user-friendly ZendSwapErrors
export function mapError(error: unknown, context: string): ZendSwapError {
  const errStr = error instanceof Error ? error.message : String(error);
  const errObj = error as any;

  // --- E2: Wallet Connection Errors ---
  if (
    context === 'wallet_connect' &&
    (errStr.includes('extension not installed') || errStr.includes('Freighter is not installed'))
  ) {
    return new ZendSwapError({
      code: 'WALLET_FREIGHTER_MISSING',
      title: 'Freighter wallet not found',
      message: 'ZendSwap requires the Freighter browser extension to connect your Stellar wallet.',
      action: 'Install Freighter',
      actionLabel: 'Install Freighter',
      actionHandler: () => window.open('https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk', '_blank'),
      severity: 'error',
      source: 'wallet',
      rawError: error,
    });
  }
  
  if (context === 'wallet_connect' && errStr.includes('cancelled')) {
    return new ZendSwapError({
      code: 'WALLET_CONNECTION_CANCELLED',
      title: 'Connection cancelled',
      message: 'You cancelled the wallet connection. Connect whenever you\'re ready.',
      actionLabel: 'Try again',
      severity: 'info',
      source: 'wallet',
      rawError: error,
    });
  }

  // Transaction Signature Rejected
  if (errStr.includes('User declined') || errStr.includes('cancelled') || errStr.includes('rejected')) {
    return new ZendSwapError({
      code: 'TX_SIGNATURE_REJECTED',
      title: 'Transaction cancelled',
      message: 'You cancelled the transaction in your wallet. No funds were moved.',
      actionLabel: 'Try again',
      severity: 'info',
      source: 'wallet',
      rawError: error,
    });
  }

  // --- E3: Transaction and Blockchain Errors ---
  if (errStr.includes('tx_bad_auth')) {
    return new ZendSwapError({
      code: 'TX_BAD_AUTH',
      title: 'Transaction signature invalid',
      message: 'The transaction could not be authenticated. This usually means your wallet signed with the wrong network.',
      action: 'Check your wallet network settings and try again.',
      severity: 'error',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('tx_insufficient_balance') || errStr.includes('op_underfunded')) {
    return new ZendSwapError({
      code: 'TX_INSUFFICIENT_BALANCE',
      title: 'Insufficient balance',
      message: 'Your account does not have enough funds for this transaction. Check your balance and try a smaller amount.',
      severity: 'error',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('tx_too_late') || errStr.includes('tx_too_early')) {
    return new ZendSwapError({
      code: 'TX_EXPIRED',
      title: 'Transaction expired',
      message: 'The transaction took too long to submit and expired. This can happen during slow network conditions.',
      actionLabel: 'Try again',
      severity: 'error',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('op_no_trust')) {
    return new ZendSwapError({
      code: 'TX_NO_TRUST',
      title: 'Trustline missing',
      message: 'Your account does not have a trustline for this asset. You need to trust the asset before you can receive it.',
      severity: 'error',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('tx_insufficient_fee') || errStr.includes('minimum reserve')) {
    return new ZendSwapError({
      code: 'TX_INSUFFICIENT_FEE',
      title: 'Not enough XLM for fees',
      message: 'Every Stellar transaction requires a small XLM fee. Your account needs at least 1 XLM as a base reserve plus a small amount for transaction fees.',
      action: 'Fund your account',
      actionLabel: 'Fund your account',
      actionHandler: () => window.open('https://friendbot.stellar.org', '_blank'),
      severity: 'error',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('429') || errStr.includes('Too Many Requests')) {
    return new ZendSwapError({
      code: 'NETWORK_RATE_LIMIT',
      title: 'Too many requests',
      message: 'The network is rate-limiting requests from your connection. Wait a moment and try again.',
      severity: 'warning',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('503') || errStr.includes('Service Unavailable')) {
    return new ZendSwapError({
      code: 'NETWORK_BUSY',
      title: 'Network busy',
      message: 'The network is experiencing high traffic. Your transaction was not lost. Try again in a few seconds.',
      actionLabel: 'Retry',
      severity: 'warning',
      source: 'transaction',
      rawError: error,
    });
  }

  if (errStr.includes('Failed to fetch') || errStr.includes('NetworkError')) {
    return new ZendSwapError({
      code: 'NETWORK_ERROR',
      title: 'Network error',
      message: 'Could not connect. Check your internet connection and try again.',
      actionLabel: 'Retry',
      severity: 'error',
      source: 'api',
      rawError: error,
    });
  }

  // --- E4: Smart Contract Errors ---
  if (errStr.includes('already spent') || errStr.includes('nullifier')) {
    return new ZendSwapError({
      code: 'CONTRACT_NULLIFIER_SPENT',
      title: 'Already withdrawn',
      message: 'This swap note has already been withdrawn. Each note can only be used once.',
      actionLabel: 'Go to dashboard',
      actionHandler: () => { window.location.href = '/'; },
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('invalid root')) {
    return new ZendSwapError({
      code: 'CONTRACT_INVALID_ROOT',
      title: 'Pool state changed',
      message: 'Someone else deposited while your proof was being generated, and the pool state has moved too far ahead. This is rare but normal.',
      actionLabel: 'Generate new proof',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('proof verification failed') || errStr.includes('VerificationFailed')) {
    return new ZendSwapError({
      code: 'CONTRACT_INVALID_PROOF',
      title: 'Proof verification failed',
      message: 'The zero-knowledge proof was rejected by the on-chain verifier. This could mean the proof was corrupted during generation or transmission.',
      actionLabel: 'Regenerate proof and try again',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('insufficient reserves') || errStr.includes('Balance too low')) {
    return new ZendSwapError({
      code: 'CONTRACT_INSUFFICIENT_RESERVES',
      title: 'Pool has insufficient funds',
      message: 'The pool does not have enough reserve to complete this swap.',
      action: 'Try a smaller amount or swap to a different asset',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  // KYC and Deny list errors
  if (errStr.includes('KYC proof required')) {
    return new ZendSwapError({
      code: 'CONTRACT_KYC_REQUIRED',
      title: 'Identity verification required',
      message: 'This pool requires identity verification before you can deposit. Verify your identity on the KYC page.',
      actionLabel: 'Verify identity',
      actionHandler: () => { window.location.href = '/kyc'; },
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('KYC verification failed')) {
    return new ZendSwapError({
      code: 'CONTRACT_KYC_FAILED',
      title: 'Identity verification failed',
      message: 'Your identity proof was rejected. This can happen if your credential has expired or the credential tree has been updated.',
      actionLabel: 'Re-verify identity',
      actionHandler: () => { window.location.href = '/kyc?reverify=true'; },
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('deny verification failed') || errStr.includes('Not eligible')) {
    return new ZendSwapError({
      code: 'CONTRACT_DENIED',
      title: 'Not eligible',
      message: 'Your address is not eligible to use this pool.',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('unsupported token')) {
    return new ZendSwapError({
      code: 'CONTRACT_UNSUPPORTED_TOKEN',
      title: 'Asset not supported',
      message: 'The selected asset is not supported by this pool.',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  if (errStr.includes('invalid rate')) {
    return new ZendSwapError({
      code: 'CONTRACT_RATE_MISMATCH',
      title: 'Exchange rate changed',
      message: 'The exchange rate changed while your proof was being generated. Your proof used an older rate that is no longer accepted.',
      actionLabel: 'Generate new proof with current rate',
      severity: 'error',
      source: 'contract',
      rawError: error,
    });
  }

  // --- E5: Proof Generation Errors ---
  if (errStr.includes('WebAssembly') || errStr.includes('WASM')) {
    return new ZendSwapError({
      code: 'PROOF_WASM_FAILED',
      title: 'Proof engine failed to load',
      message: 'The zero-knowledge proof engine could not start. This can happen in private browsing mode or if your browser blocks WebAssembly.',
      action: 'Try in a regular browser window. Make sure you\'re using Chrome or Brave with WebAssembly enabled.',
      severity: 'error',
      source: 'proof',
      rawError: error,
    });
  }

  if (errStr.includes('circuit') || errStr.includes('artifact not found')) {
    return new ZendSwapError({
      code: 'PROOF_CIRCUIT_MISSING',
      title: 'Circuit data missing',
      message: 'A required file for proof generation could not be loaded. Try refreshing the page.',
      actionLabel: 'Refresh page',
      actionHandler: () => window.location.reload(),
      severity: 'error',
      source: 'proof',
      rawError: error,
    });
  }

  if (errStr.includes('constraint not satisfied')) {
    return new ZendSwapError({
      code: 'PROOF_INVALID_WITNESS',
      title: 'Invalid swap parameters',
      message: 'The proof could not be generated because the swap parameters are inconsistent. This usually means the calculated amounts don\'t match the exchange rate precisely.',
      action: 'Try adjusting the amount slightly and retry',
      severity: 'error',
      source: 'proof',
      rawError: error,
    });
  }

  if (errStr.includes('timeout')) {
    return new ZendSwapError({
      code: 'PROOF_TIMEOUT',
      title: 'Proof generation timed out',
      message: 'Generating the proof is taking too long. This can happen on older devices or when your computer is under heavy load.',
      action: 'Close other tabs and try again. Proof generation typically takes 5-20 seconds.',
      severity: 'error',
      source: 'proof',
      rawError: error,
    });
  }

  // --- E7: Browser Environment Errors ---
  if (errStr.includes('localStorage') || errStr.includes('QuotaExceededError')) {
    return new ZendSwapError({
      code: 'BROWSER_STORAGE_FULL',
      title: 'Browser storage full',
      message: 'Your browser\'s local storage is full. ZendSwap needs space to store your encrypted swap notes. Clear some browser data and try again.',
      severity: 'error',
      source: 'browser',
      rawError: error,
    });
  }

  // Fallback
  return new ZendSwapError({
    code: 'UNKNOWN_ERROR',
    title: 'An unexpected error occurred',
    message: errStr || 'Something went wrong.',
    severity: 'error',
    source: 'unknown',
    rawError: error,
  });
}

// Main handler
export function handleError(error: unknown, context: string, showToast = true): ZendSwapError {
  const zendSwapError = error instanceof ZendSwapError ? error : mapError(error, context);

  // Always log for debugging
  console.error(`[ZendSwapError - ${context}]`, {
    code: zendSwapError.code,
    title: zendSwapError.title,
    message: zendSwapError.message,
    raw: zendSwapError.rawError
  });

  if (showToast && zendSwapError.severity !== 'silent') {
    useToastStore.getState().addToast({
      title: zendSwapError.title,
      message: zendSwapError.message,
      severity: zendSwapError.severity === 'catastrophic' ? 'error' : zendSwapError.severity,
      action: zendSwapError.actionLabel ? {
        label: zendSwapError.actionLabel,
        onClick: zendSwapError.actionHandler || (() => {})
      } : undefined,
      duration: zendSwapError.severity === 'error' || zendSwapError.severity === 'catastrophic' ? 0 : 5000,
    });
  }

  return zendSwapError;
}
