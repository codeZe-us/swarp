import {
  rpc,
  Address,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Account,
  StrKey,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';
import {
  POOL_CONTRACT_ID,
  SOROBAN_RPC_URL,
  STELLAR_NETWORK_PASSPHRASE,
} from './constants';
import { signTransaction as walletSignTransaction } from './stellar';

// Custom error classes for clear categorization
export class SorobanNetworkError extends Error {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'SorobanNetworkError';
  }
}

export class SorobanSimulationError extends Error {
  constructor(message: string, public rawError?: any) {
    super(message);
    this.name = 'SorobanSimulationError';
  }
}

export class SorobanTransactionError extends Error {
  constructor(message: string, public txHash?: string, public rawResult?: any) {
    super(message);
    this.name = 'SorobanTransactionError';
  }
}

// Retry logic: 1 retry after 2 seconds delay
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delay = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      console.warn(`RPC call failed, retrying in ${delay / 1000} seconds...`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay);
    }
    throw error;
  }
}

// Parse contract & token error logs/codes to user-friendly messages
export function parseSorobanError(error: any): string {
  if (!error) return 'Unknown error occurred.';

  const errorStr = typeof error === 'string'
    ? error
    : error?.message || error?.error || JSON.stringify(error);

  // ZendSwap specific ContractError mapping (defined in contracts/zendswap-pool/src/lib.rs)
  if (errorStr.includes('Contract, #1') || errorStr.includes('Error(Contract, #1)')) {
    return 'The ZendSwap pool is not initialized.';
  }
  if (errorStr.includes('Contract, #2') || errorStr.includes('Error(Contract, #2)')) {
    return 'The ZendSwap pool is already initialized.';
  }
  if (errorStr.includes('Contract, #3') || errorStr.includes('Error(Contract, #3)')) {
    return 'The selected token is not supported by the pool.';
  }
  if (errorStr.includes('Contract, #4') || errorStr.includes('Error(Contract, #4)')) {
    return 'The transaction amount is invalid, zero, or negative.';
  }
  if (errorStr.includes('Contract, #5') || errorStr.includes('Error(Contract, #5)')) {
    return 'This withdrawal has already been processed (nullifier already spent).';
  }
  if (errorStr.includes('Contract, #6') || errorStr.includes('Error(Contract, #6)')) {
    return 'The Merkle root is invalid or has expired.';
  }
  if (errorStr.includes('Contract, #7') || errorStr.includes('Error(Contract, #7)')) {
    return 'ZK proof verification failed. Please check your proof inputs.';
  }
  if (errorStr.includes('Contract, #8') || errorStr.includes('Error(Contract, #8)')) {
    return 'The ZK verifier contract execution failed.';
  }
  if (errorStr.includes('Contract, #9') || errorStr.includes('Error(Contract, #9)')) {
    return 'Unauthorized action.';
  }
  if (errorStr.includes('Contract, #10') || errorStr.includes('Error(Contract, #10)')) {
    return 'Invalid rate (numerator/denominator must be positive and denominator exactly 10,000,000).';
  }

  // Parse common token SAC errors
  if (
    errorStr.toLowerCase().includes('insufficient balance') ||
    errorStr.includes('Error(Token, #1)') ||
    errorStr.includes('underfunded') ||
    errorStr.includes('balance is not enough')
  ) {
    return 'Insufficient balance in your wallet for this transaction.';
  }
  if (
    errorStr.toLowerCase().includes('trustline') ||
    errorStr.includes('Error(Token, #3)') ||
    errorStr.includes('no trustline')
  ) {
    return 'Missing required trustline for the token in your wallet.';
  }

  return `Transaction simulation failed: ${errorStr}`;
}

// Dummy credentials for read-only simulations
const DUMMY_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWH';

function getDummyAccount(): Account {
  return new Account(DUMMY_PUBLIC_KEY, '0');
}

/**
 * Read-only getters
 */

export async function getPoolInfo(): Promise<{
  usdcReserve: bigint;
  eurcReserve: bigint;
  currentRate: number;
  rateDenominator: number;
  totalDeposits: number;
  currentRoot: string;
}> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_pool_info'))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from pool info simulation.');
  }

  const nativeObj = scValToNative(resultVal);
  return {
    usdcReserve: typeof nativeObj.usdc_reserve === 'bigint' ? nativeObj.usdc_reserve : BigInt(nativeObj.usdc_reserve ?? 0),
    eurcReserve: typeof nativeObj.eurc_reserve === 'bigint' ? nativeObj.eurc_reserve : BigInt(nativeObj.eurc_reserve ?? 0),
    currentRate: typeof nativeObj.current_rate === 'bigint' ? Number(nativeObj.current_rate) : Number(nativeObj.current_rate ?? 0),
    rateDenominator: typeof nativeObj.rate_denominator === 'bigint' ? Number(nativeObj.rate_denominator) : Number(nativeObj.rate_denominator ?? 1),
    totalDeposits: typeof nativeObj.total_deposits === 'bigint' ? Number(nativeObj.total_deposits) : Number(nativeObj.total_deposits ?? 0),
    currentRoot: Buffer.from(nativeObj.current_root).toString('hex'),
  };
}

export async function getMerkleRoot(): Promise<string> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_root'))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from get root simulation.');
  }

  const rootBytes = scValToNative(resultVal);
  return Buffer.from(rootBytes).toString('hex');
}

export async function getRate(): Promise<{ numerator: number; denominator: number }> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_rate'))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from get rate simulation.');
  }

  const rateVal = scValToNative(resultVal);
  const numerator = typeof rateVal[0] === 'bigint' ? Number(rateVal[0]) : Number(rateVal[0]);
  const denominator = typeof rateVal[1] === 'bigint' ? Number(rateVal[1]) : Number(rateVal[1]);
  return { numerator, denominator };
}

export async function getLeaf(index: number): Promise<string> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_leaf', nativeToScVal(index, { type: 'u32' })))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from get leaf simulation.');
  }

  const leafBytes = scValToNative(resultVal);
  return Buffer.from(leafBytes).toString('hex');
}

export async function getLeafCount(): Promise<number> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_leaf_count'))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from get leaf count simulation.');
  }

  const count = scValToNative(resultVal);
  return typeof count === 'bigint' ? Number(count) : Number(count);
}

export async function getReserves(): Promise<{ usdc: bigint; eurc: bigint }> {
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_reserves'))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

  if (rpc.Api.isSimulationError(simulation)) {
    throw new SorobanSimulationError(parseSorobanError(simulation.error), simulation.error);
  }

  const resultVal = simulation.result?.retval;
  if (!resultVal) {
    throw new Error('No return value from get reserves simulation.');
  }

  const reservesVal = scValToNative(resultVal);
  return {
    usdc: typeof reservesVal[0] === 'bigint' ? reservesVal[0] : BigInt(reservesVal[0] ?? 0),
    eurc: typeof reservesVal[1] === 'bigint' ? reservesVal[1] : BigInt(reservesVal[1] ?? 0),
  };
}

/**
 * Write transaction submission functions
 */

export async function submitDeposit(
  depositor: string,
  token: string,
  amount: bigint | string | number,
  commitment: string
): Promise<{ txHash: string; leafIndex: number }> {
  // 1. Inputs validation
  if (!depositor || !StrKey.isValidEd25519PublicKey(depositor)) {
    throw new Error('Invalid depositor address.');
  }
  if (!token || !StrKey.isValidEd25519PublicKey(token)) {
    throw new Error('Invalid token address.');
  }
  const amountBig = BigInt(amount);
  if (amountBig <= BigInt(0)) {
    throw new Error('Amount must be positive.');
  }
  if (!commitment || !/^[0-9a-fA-F]{64}$/.test(commitment)) {
    throw new Error('Commitment must be a valid 32-byte (64 character) hex string.');
  }
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

  // 2. Fetch active source account context (including sequence number)
  let account;
  try {
    account = await withRetry(() => rpcServer.getAccount(depositor));
  } catch (error) {
    throw new SorobanNetworkError('Failed to fetch depositor account details from RPC.', error);
  }

  // 3. Build base transaction
  const contract = new Contract(POOL_CONTRACT_ID);
  const depositorVal = new Address(depositor).toScVal();
  const tokenVal = new Address(token).toScVal();
  const amountVal = nativeToScVal(amountBig, { type: 'i128' });
  const commitmentBytes = Buffer.from(commitment, 'hex');
  const commitmentVal = xdr.ScVal.scvBytes(commitmentBytes);

  let transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('deposit', depositorVal, tokenVal, amountVal, commitmentVal))
    .setTimeout(30) // timeout: 30 seconds
    .build();

  // 4. Simulate Transaction
  let simulation;
  try {
    simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));
  } catch (error) {
    throw new SorobanNetworkError('Network error during transaction simulation.', error);
  }

  if (rpc.Api.isSimulationError(simulation)) {
    const errorMsg = parseSorobanError(simulation.error);
    throw new SorobanSimulationError(errorMsg, simulation.error);
  }

  // 5. Assemble transaction details using simulated footprint and fee settings
  try {
    transaction = rpc.assembleTransaction(transaction, simulation).build();
  } catch (error) {
    throw new SorobanSimulationError('Failed to assemble transaction resources from simulation.', error);
  }

  // 6. Sign transaction via the Freighter/kit extension
  const xdrString = transaction.toXDR();
  let signedXdr;
  try {
    signedXdr = await walletSignTransaction(xdrString);
  } catch (error: any) {
    throw new Error(`Transaction signature rejected: ${error.message || error}`);
  }

  // 7. Submit transaction
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE) as Transaction;
  let response;
  try {
    response = await withRetry(() => rpcServer.sendTransaction(signedTx));
  } catch (error) {
    throw new SorobanNetworkError('Failed to submit transaction to RPC.', error);
  }

  if (response.status === 'ERROR') {
    const errorMsg = parseSorobanError(response.errorResult);
    throw new SorobanTransactionError(errorMsg, response.hash, response.errorResult);
  }

  // 8. Poll for confirmation status
  let getResponse = await withRetry(() => rpcServer.getTransaction(response.hash));
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds polling timeout
  while (getResponse.status === 'NOT_FOUND' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResponse = await withRetry(() => rpcServer.getTransaction(response.hash));
    attempts++;
  }

  if (getResponse.status === 'SUCCESS') {
    const returnValueVal = getResponse.returnValue;
    const leafIndex = returnValueVal ? Number(scValToNative(returnValueVal)) : 0;
    return {
      txHash: response.hash,
      leafIndex,
    };
  }

  if (getResponse.status === 'FAILED') {
    const errorMsg = parseSorobanError(getResponse.resultXdr);
    throw new SorobanTransactionError(errorMsg, response.hash, getResponse.resultXdr);
  }

  throw new SorobanTransactionError(`Transaction status: ${getResponse.status}`, response.hash);
}

export async function submitWithdraw(
  recipient: string,
  assetOut: string,
  proof: string,
  nullifier: string,
  merkleRoot: string,
  withdrawalAmount: bigint | string | number
): Promise<{ txHash: string }> {
  // 1. Inputs validation
  if (!recipient || !StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error('Invalid recipient address.');
  }
  if (!assetOut || !StrKey.isValidEd25519PublicKey(assetOut)) {
    throw new Error('Invalid assetOut address.');
  }
  if (!proof || proof.length === 0) {
    throw new Error('Proof cannot be empty.');
  }
  if (!nullifier || !/^[0-9a-fA-F]{64}$/.test(nullifier)) {
    throw new Error('Nullifier must be a valid 32-byte (64 character) hex string.');
  }
  if (!merkleRoot || !/^[0-9a-fA-F]{64}$/.test(merkleRoot)) {
    throw new Error('Merkle root must be a valid 32-byte (64 character) hex string.');
  }
  const amountBig = BigInt(withdrawalAmount);
  if (amountBig <= BigInt(0)) {
    throw new Error('Withdrawal amount must be positive.');
  }
  if (!POOL_CONTRACT_ID) {
    throw new Error('Pool contract address is not configured.');
  }

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

  // 2. Fetch recipient account details
  let account;
  try {
    account = await withRetry(() => rpcServer.getAccount(recipient));
  } catch (error) {
    throw new SorobanNetworkError('Failed to fetch recipient account details from RPC.', error);
  }

  // 3. Build Transaction
  const contract = new Contract(POOL_CONTRACT_ID);
  const recipientVal = new Address(recipient).toScVal();
  const assetOutVal = new Address(assetOut).toScVal();
  const proofBytes = Buffer.from(proof, 'hex');
  const proofVal = nativeToScVal(proofBytes);
  const nullifierVal = xdr.ScVal.scvBytes(Buffer.from(nullifier, 'hex'));
  const merkleRootVal = xdr.ScVal.scvBytes(Buffer.from(merkleRoot, 'hex'));
  const withdrawalAmountVal = nativeToScVal(amountBig, { type: 'i128' });

  let transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'withdraw',
        recipientVal,
        assetOutVal,
        proofVal,
        nullifierVal,
        merkleRootVal,
        withdrawalAmountVal
      )
    )
    .setTimeout(60) // timeout: 60 seconds
    .build();

  // 4. Simulate Transaction
  let simulation;
  try {
    simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));
  } catch (error) {
    throw new SorobanNetworkError('Network error during transaction simulation.', error);
  }

  if (rpc.Api.isSimulationError(simulation)) {
    const errorMsg = parseSorobanError(simulation.error);
    throw new SorobanSimulationError(errorMsg, simulation.error);
  }

  // 5. Assemble transaction footprint details
  try {
    transaction = rpc.assembleTransaction(transaction, simulation).build();
  } catch (error) {
    throw new SorobanSimulationError('Failed to assemble transaction resources from simulation.', error);
  }

  // 6. Sign transaction XDR via the Freighter/kit extension
  const xdrString = transaction.toXDR();
  let signedXdr;
  try {
    signedXdr = await walletSignTransaction(xdrString);
  } catch (error: any) {
    throw new Error(`Transaction signature rejected: ${error.message || error}`);
  }

  // 7. Submit transaction
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE) as Transaction;
  let response;
  try {
    response = await withRetry(() => rpcServer.sendTransaction(signedTx));
  } catch (error) {
    throw new SorobanNetworkError('Failed to submit transaction to RPC.', error);
  }

  if (response.status === 'ERROR') {
    const errorMsg = parseSorobanError(response.errorResult);
    throw new SorobanTransactionError(errorMsg, response.hash, response.errorResult);
  }

  // 8. Poll for transaction completion
  let getResponse = await withRetry(() => rpcServer.getTransaction(response.hash));
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds polling timeout
  while (getResponse.status === 'NOT_FOUND' && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    getResponse = await withRetry(() => rpcServer.getTransaction(response.hash));
    attempts++;
  }

  if (getResponse.status === 'SUCCESS') {
    return {
      txHash: response.hash,
    };
  }

  if (getResponse.status === 'FAILED') {
    const errorMsg = parseSorobanError(getResponse.resultXdr);
    throw new SorobanTransactionError(errorMsg, response.hash, getResponse.resultXdr);
  }

  throw new SorobanTransactionError(`Transaction status: ${getResponse.status}`, response.hash);
}

export async function getTokenBalance(
  userAddress: string,
  tokenAddress: string
): Promise<bigint> {
  if (!tokenAddress) {
    return BigInt(0);
  }

  const dummyAccount = getDummyAccount();
  const contract = new Contract(tokenAddress);
  const userVal = new Address(userAddress).toScVal();

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('balance', userVal))
    .setTimeout(30)
    .build();

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);
  try {
    const simulation = await withRetry(() => rpcServer.simulateTransaction(transaction));

    if (rpc.Api.isSimulationError(simulation)) {
      return BigInt(0);
    }

    const resultVal = simulation.result?.retval;
    if (!resultVal) {
      return BigInt(0);
    }

    const balance = scValToNative(resultVal);
    return typeof balance === 'bigint' ? balance : BigInt(balance ?? 0);
  } catch (e) {
    console.warn('Failed to simulate token balance check, returning 0:', e);
    return BigInt(0);
  }
}

