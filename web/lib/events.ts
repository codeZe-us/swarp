import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { withRetry, getConfig, getLeafCount, getLeaf } from './contracts';
import { getZeroValues } from './merkle';

export interface DepositEventData {
  commitment: string;
  leafIndex: number;
  token: string;
}

export async function fetchDepositEvents(fromLedger?: number, poolContractIdOverride?: string): Promise<DepositEventData[]> {
  const config = getConfig();
  const POOL_CONTRACT_ID = poolContractIdOverride || config.POOL_CONTRACT_ID;
  const { SOROBAN_RPC_URL } = config;
  if (!POOL_CONTRACT_ID) {
    console.warn('MOCK MODE: fetchDepositEvents');
    return [];
  }

  const rpcServer = new rpc.Server(SOROBAN_RPC_URL);

  let startLedger: number;
  if (fromLedger !== undefined) {
    startLedger = fromLedger;
  } else {
    try {
      const latest = await withRetry(() => rpcServer.getLatestLedger());
      startLedger = Math.max(1, latest.sequence - 120000);
    } catch (e) {
      console.warn('Failed to fetch latest ledger sequence. Falling back to sequence 1.', e);
      startLedger = 1;
    }
  }

  const depositTopic = xdr.ScVal.scvSymbol('deposit').toXDR('base64');

  const response = await withRetry(() =>
    rpcServer.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [POOL_CONTRACT_ID],
          topics: [[depositTopic]],
        },
      ],
    })
  );

  const events: DepositEventData[] = [];

  for (const item of response.events) {
    try {
      const nativeVal = scValToNative(item.value);

      const commitment = Buffer.from(nativeVal.commitment).toString('hex');
      const leafIndex = typeof nativeVal.leaf_index === 'bigint'
        ? Number(nativeVal.leaf_index)
        : Number(nativeVal.leaf_index);
      const token = typeof nativeVal.token === 'string'
        ? nativeVal.token
        : nativeVal.token.toString();

      events.push({ commitment, leafIndex, token });
    } catch (e) {
      console.warn('Failed to parse deposit event, skipping entry:', e, item);
    }
  }

  events.sort((a, b) => a.leafIndex - b.leafIndex);

  return events;
}

export async function reconstructCommitmentsFromChain(poolContractIdOverride?: string): Promise<bigint[]> {
  const count = await getLeafCount(poolContractIdOverride);
  if (count === 0) return [];

  const leaves: bigint[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const hexLeaf = await getLeaf(i, poolContractIdOverride);
      leaves.push(BigInt('0x' + hexLeaf));
    } catch (e) {
      console.warn(`Failed to fetch leaf ${i} from chain:`, e);
      const zeros = getZeroValues();
      leaves.push(zeros[0]);
    }
  }
  return leaves;
}

export async function reconstructCommitments(poolContractIdOverride?: string): Promise<bigint[]> {
  try {
    const chainLeaves = await reconstructCommitmentsFromChain(poolContractIdOverride);
    if (chainLeaves.length > 0) {
      console.log(`reconstructCommitments: loaded ${chainLeaves.length} leaves from on-chain storage`);
      return chainLeaves;
    }
  } catch (e) {
    console.warn('reconstructCommitmentsFromChain failed, falling back to events:', e);
  }

  const events = await fetchDepositEvents(undefined, poolContractIdOverride);
  const zeros = getZeroValues();
  const zeroLeaf = zeros[0];

  const leavesMap = new Map<number, bigint>();
  let maxIndex = -1;

  for (const event of events) {
    leavesMap.set(event.leafIndex, BigInt('0x' + event.commitment));
    if (event.leafIndex > maxIndex) {
      maxIndex = event.leafIndex;
    }
  }

  const leaves: bigint[] = [];
  for (let i = 0; i <= maxIndex; i++) {
    if (leavesMap.has(i)) {
      leaves.push(leavesMap.get(i)!);
    } else {
      leaves.push(zeroLeaf);
    }
  }

  return leaves;
}
