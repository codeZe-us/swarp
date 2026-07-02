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
import { useStore } from '../store/useStore';

export function getConfig() {
  const config = useStore.getState().config;
  if (!config) {
    throw new Error('Application configuration is not loaded yet.');
  }
  return config;
}
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
  // if (errorStr.includes('Contract, #1') || errorStr.includes('Error(Contract, #1)')) {
  //   return 'The ZendSwap pool is not initialized.';
  // }
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

import { Keypair } from '@stellar/stellar-sdk';

function getDummyAccount(): Account {
  // Use a randomly generated valid public key for simulation to satisfy strict checksum validation
  const dummyPublicKey = Keypair.random().publicKey();
  return new Account(dummyPublicKey, '0');
}

/**
 * Read-only getters
 */

export async function getPoolInfo(poolContractIdOverride?: string): Promise<{
  usdcReserve: bigint;
  eurcReserve: bigint;
  currentRate: number;
  rateDenominator: number;
  totalDeposits: number;
  currentRoot: string;
}> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

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

export async function getMerkleRoot(poolContractIdOverride?: string): Promise<string> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

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

export async function getRate(assetInId: number, assetOutId: number, poolContractIdOverride?: string): Promise<{ numerator: number; denominator: number }> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

  const dummyAccount = getDummyAccount();
  const contract = new Contract(POOL_CONTRACT_ID);

  const transaction = new TransactionBuilder(dummyAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'get_rate',
        nativeToScVal(assetInId, { type: 'u64' }),
        nativeToScVal(assetOutId, { type: 'u64' })
      )
    )
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

export async function getLeaf(index: number, poolContractIdOverride?: string): Promise<string> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

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

export async function getLeafCount(poolContractIdOverride?: string): Promise<number> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

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

export async function getReserves(poolContractIdOverride?: string): Promise<bigint[]> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

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
  if (!Array.isArray(reservesVal)) {
    return [];
  }
  return reservesVal.map((r: any) => typeof r === 'bigint' ? r : BigInt(r ?? 0));
}

/**
 * Write transaction submission functions
 */

export async function submitDeposit(
  depositor: string,
  assetId: number,
  amount: string,
  commitment: string
): Promise<{ txHash: string; leafIndex: number }> {
  const { POOL_CONTRACT_ID, SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = getConfig();

  // 1. Inputs validation
  if (!depositor || !StrKey.isValidEd25519PublicKey(depositor)) {
    throw new Error('Invalid depositor address.');
  }
  if (assetId < 0 || assetId > 4) {
    throw new Error('Invalid asset ID.');
  }
  const amountBig = BigInt(amount);
  if (amountBig <= BigInt(0)) {
    throw new Error('Amount must be positive.');
  }
  if (!commitment || !/^[0-9a-fA-F]{64}$/.test(commitment)) {
    throw new Error('Commitment must be a valid 32-byte (64 character) hex string.');
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
  const assetIdVal = nativeToScVal(assetId, { type: 'u64' });
  const amountVal = nativeToScVal(amountBig, { type: 'i128' });
  const commitmentBytes = Buffer.from(commitment, 'hex');
  const commitmentVal = xdr.ScVal.scvBytes(commitmentBytes);

  let transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('deposit', depositorVal, assetIdVal, amountVal, commitmentVal))
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
  // 7. Submit transaction
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE) as Transaction;
  let response;
  try {
    response = await withRetry(() => rpcServer.sendTransaction(signedTx));
  } catch (error) {
    throw new SorobanNetworkError('Failed to submit transaction to RPC.', error);
  }

  if (response.status === 'ERROR') {
    throw new SorobanTransactionError('Transaction submission failed.', response.hash, response);
  }

  // Poll for transaction confirmation
  let txStatus;
  let attempts = 0;
  while (attempts < 20) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    try {
      txStatus = await rpcServer.getTransaction(response.hash);
      if (txStatus.status !== 'NOT_FOUND') {
        break;
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Bad union switch: 4')) {
        console.warn('stellar-sdk failed to parse getTransaction result in deposit. Fetching raw RPC...');
        try {
          const rawResponse = await fetch(SOROBAN_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: { hash: response.hash }
            })
          });
          const rawData = await rawResponse.json();
          if (rawData.result && rawData.result.status === 'SUCCESS') {
            txStatus = rawData.result;
            break;
          } else {
            console.error('Raw RPC getTransaction failed result:', JSON.stringify(rawData, null, 2));
            throw new Error('Deposit transaction execution failed on the network. See console for raw RPC output.');
          }
        } catch (rawErr) {
          throw e;
        }
      }
      throw e;
    }
    attempts++;
  }

  if (txStatus?.status !== 'SUCCESS') {
    throw new SorobanTransactionError(`Transaction failed with status: ${txStatus?.status}`, response.hash, txStatus);
  }

  // Extract leafIndex from deposit event emitted by the contract
  let leafIndex = 0;
  try {
    // txStatus.resultMetaXdr contains the transaction result metadata including contract events
    const resultMeta = txStatus?.resultMetaXdr;
    if (resultMeta) {
      // The deposit event contains { commitment, leaf_index, token }
      // Parse events from transaction meta to get the leaf_index
      const rawEvents = (txStatus as any)?.events;
      const events = Array.isArray(rawEvents) ? rawEvents : (rawEvents ? [rawEvents] : []);
      for (const evt of events) {
        try {
          const native = scValToNative(evt.value ?? evt);
          if (native && typeof native === 'object' && 'leaf_index' in native) {
            leafIndex = typeof native.leaf_index === 'bigint'
              ? Number(native.leaf_index)
              : Number(native.leaf_index ?? 0);
            break;
          }
        } catch (_) {
          // skip unparseable events
        }
      }
    }
    // If not found in events, try to get the leaf count from chain minus 1
    if (leafIndex === 0) {
      try {
        leafIndex = await getLeafCount() - 1;
        if (leafIndex < 0) leafIndex = 0;
      } catch (_) {
        leafIndex = 0;
      }
    }
  } catch (e) {
    console.warn('Could not extract leafIndex from deposit result, using 0', e);
    leafIndex = 0;
  }
  return { txHash: response.hash, leafIndex };
}

export async function submitPayment(
  sender: string,
  recipient: string,
  tokenContractId: string,
  amount: bigint | string | number
): Promise<{ txHash: string }> {
  // 1. Inputs validation
  if (!sender || !StrKey.isValidEd25519PublicKey(sender)) {
    throw new Error('Invalid sender address.');
  }
  if (!recipient || !StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error('Invalid recipient address.');
  }
  const amountBig = BigInt(amount);
  if (amountBig <= BigInt(0)) {
    throw new Error('Amount must be positive.');
  }

  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = getConfig();
  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

  // 2. Fetch active source account context (including sequence number)
  let account;
  try {
    account = await withRetry(() => rpcServer.getAccount(sender));
  } catch (error) {
    throw new SorobanNetworkError('Failed to fetch sender account details from RPC.', error);
  }

  // 3. Build base transaction
  const contract = new Contract(tokenContractId);
  const senderVal = new Address(sender).toScVal();
  const recipientVal = new Address(recipient).toScVal();
  const amountVal = nativeToScVal(amountBig, { type: 'i128' });

  let transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('transfer', senderVal, recipientVal, amountVal))
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
    signedXdr = await walletSignTransaction(xdrString, sender);
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
  assetInId: number,
  assetOutId: number,
  proof: string,
  nullifier: string,
  merkleRoot: string,
  withdrawalAmount: bigint | string | number,
  poolContractIdOverride?: string
): Promise<{ txHash: string }> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = config;

  // 1. Inputs validation
  if (!recipient || !StrKey.isValidEd25519PublicKey(recipient)) {
    throw new Error('Invalid recipient address.');
  }
  if (assetInId < 0 || assetInId > 4) {
    throw new Error('Invalid asset in ID.');
  }
  if (assetOutId < 0 || assetOutId > 4) {
    throw new Error('Invalid asset out ID.');
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
  const assetInIdVal = nativeToScVal(assetInId, { type: 'u64' });
  const assetOutIdVal = nativeToScVal(assetOutId, { type: 'u64' });
  const proofBytes = Buffer.from(proof, 'hex');
  const proofVal = nativeToScVal(proofBytes);
  const nullifierVal = xdr.ScVal.scvBytes(Buffer.from(nullifier, 'hex'));
  const merkleRootVal = xdr.ScVal.scvBytes(Buffer.from(merkleRoot, 'hex'));
  const withdrawalAmountVal = nativeToScVal(amountBig, { type: 'i128' });

  let transaction = new TransactionBuilder(account, {
    fee: '100000000', // 10 XLM base fee
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'withdraw',
        recipientVal,
        assetInIdVal,
        assetOutIdVal,
        proofVal,
        nullifierVal,
        merkleRootVal,
        withdrawalAmountVal
      )
    )
    .setTimeout(300) // timeout: 300 seconds
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
    // Bump resource fee by adding 100000000 stroops (10 XLM) for headroom
    const bumpedFee = (Number(transaction.fee) + 100000000).toString();
    transaction = TransactionBuilder.cloneFrom(transaction, { fee: bumpedFee }).build() as Transaction;
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
  let getResponse: any;
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds polling timeout
  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      getResponse = await withRetry(() => rpcServer.getTransaction(response.hash));
      if (getResponse.status !== 'NOT_FOUND') {
        break;
      }
    } catch (e: any) {
      if (e.message && e.message.includes('Bad union switch: 4')) {
        console.warn('stellar-sdk failed to parse getTransaction result in withdraw. Fetching raw RPC...');
        try {
          const rawResponse = await fetch(SOROBAN_RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: { hash: response.hash }
            })
          });
          const rawData = await rawResponse.json();
          if (rawData.result && rawData.result.status === 'SUCCESS') {
            getResponse = rawData.result;
            break;
          } else {
            console.error('Raw RPC getTransaction failed result:', JSON.stringify(rawData, null, 2));
            throw new Error('Withdraw transaction execution failed on the network. See console for details.');
          }
        } catch (rawErr) {
          throw e;
        }
      }
      throw e;
    }
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
    if (typeof window !== 'undefined') {
      const mockBal = localStorage.getItem(`mock_bal_${userAddress}`);
      if (mockBal) return BigInt(mockBal);
    }
    return BigInt(0);
  }

  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE } = getConfig();
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

/**
 * Hackathon Faucet / Fund logic
 */
export async function fundTestnetAsset(recipientAddress: string, assetCode: string, amount: string = '200') {
  const { SOROBAN_RPC_URL, STELLAR_NETWORK_PASSPHRASE, STELLAR_HORIZON_URL } = getConfig();
  
  // Resolve issuer secret and address dynamically based on assetCode
  const envSecretKey = `NEXT_PUBLIC_${assetCode.toUpperCase()}_ISSUER_SECRET`;
  const envAddressKey = `NEXT_PUBLIC_${assetCode.toUpperCase()}_ISSUER_ADDRESS`;
  
  const issuerSecret = process.env[envSecretKey];
  const issuerAddress = process.env[envAddressKey];

  if (!issuerSecret || !issuerAddress) {
    throw new Error(`Issuer Secret or Address not found in environment for ${assetCode}`);
  }

  const issuerKeypair = typeof StrKey.isValidEd25519SecretSeed === 'function' && StrKey.isValidEd25519SecretSeed(issuerSecret)
    ? (await import('@stellar/stellar-sdk')).Keypair.fromSecret(issuerSecret)
    : (await import('@stellar/stellar-sdk')).Keypair.fromSecret(issuerSecret);

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

  let issuerAccount;
  try {
    issuerAccount = await withRetry(() => rpcServer.getAccount(issuerAddress));
  } catch (e) {
    throw new Error('Could not load issuer account from testnet. Is the issuer funded?');
  }

  const asset = new (await import('@stellar/stellar-sdk')).Asset(assetCode, issuerAddress);

  const transaction = new (await import('@stellar/stellar-sdk')).TransactionBuilder(issuerAccount, {
    fee: (await import('@stellar/stellar-sdk')).BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation((await import('@stellar/stellar-sdk')).Operation.payment({
      destination: recipientAddress,
      asset: asset,
      amount: amount.toString(),
    }))
    .setTimeout(30)
    .build();

  transaction.sign(issuerKeypair);

  const horizon = new (await import('@stellar/stellar-sdk')).Horizon.Server(STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org');
  
  try {
    const response = await horizon.submitTransaction(transaction as any);
    if (!response.successful) {
      throw new Error('Fund transaction failed');
    }
    return response.hash;
  } catch (err: any) {
    if (err.response && err.response.data && err.response.data.extras && err.response.data.extras.result_codes) {
      throw new Error(`Transaction Failed: ${JSON.stringify(err.response.data.extras.result_codes)}`);
    }
    throw new Error(err.message || 'Failed to submit payment transaction');
  }
}


export async function establishTrustline(userAddress: string, assetCode: string, issuerAddress: string): Promise<string> {
  const { signTransaction } = await import('./stellar');
  const { Horizon, TransactionBuilder, Asset, Operation } = await import('@stellar/stellar-sdk');
  const { STELLAR_HORIZON_URL, STELLAR_NETWORK_PASSPHRASE } = getConfig();

  const horizon = new Horizon.Server(STELLAR_HORIZON_URL);
  let userAccount;
  try {
    userAccount = await horizon.loadAccount(userAddress);
  } catch (e) {
    try {
      console.log('Account not found, requesting friendbot funding...');
      const response = await fetch(`https://friendbot.stellar.org/?addr=${userAddress}`);
      if (!response.ok) throw new Error('Friendbot funding failed');
      userAccount = await horizon.loadAccount(userAddress);
    } catch (friendbotErr) {
      throw new Error('Your Testnet account is not funded with XLM, and automatic funding via Friendbot failed. Please use the Stellar Laboratory Friendbot manually.');
    }
  }

  const asset = new Asset(assetCode, issuerAddress);

  const transaction = new TransactionBuilder(userAccount, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({
      asset: asset,
    }))
    .setTimeout(30)
    .build();

  console.log('--- DEBUG: ChangeTrust Transaction ---');
  console.log('Transaction Source Account:', transaction.source);
  console.log('User Address (from state):', userAddress);
  console.log('Network Passphrase:', STELLAR_NETWORK_PASSPHRASE);
  console.log('Asset Code/Issuer:', assetCode, issuerAddress);
  
  const signedXdr = await signTransaction(transaction.toXDR(), userAddress);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK_PASSPHRASE) as any;
  
  console.log('Reconstructed Tx Source:', signedTx.source);
  console.log('Reconstructed Tx Signatures Count:', signedTx.signatures?.length);
  if (signedTx.signatures?.length > 0) {
    console.log('Signature Hint:', signedTx.signatures[0].hint().toString('hex'));
  }
  console.log('--------------------------------------');
  
  try {
    const response = await horizon.submitTransaction(signedTx as any);
    if (!response.successful) {
      throw new Error('Failed to establish trustline');
    }
    return response.hash;
  } catch (err: any) {
    if (err.response && err.response.data && err.response.data.extras && err.response.data.extras.result_codes) {
      const codes = err.response.data.extras.result_codes;
      throw new Error(`Horizon rejected ChangeTrust: ${codes.transaction} / ${codes.operations ? codes.operations.join(', ') : ''}`);
    }
    throw err;
  }
}
