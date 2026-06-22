import { rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import { POOL_CONTRACT_ID, SOROBAN_RPC_URL } from './constants';
import { withRetry } from './contracts';
import { getZeroValues } from './merkle';

export interface DepositEventData {
  commitment: string;
  leafIndex: number;
  token: string;
}

/**
 * Fetches deposit events emitted by the ZendSwap pool contract from Stellar RPC.
 * Automatically handles historical query limits (pruning to 7-day windows in RPC nodes).
 */
export async function fetchDepositEvents(fromLedger?: number): Promise<DepositEventData[]> {
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
      // Query approximately the last 7 days of events (120,000 ledgers)
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
      // Decode event value: DepositEvent { commitment: BytesN<32>, leaf_index: u32, token: Address }
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

  // Sort events by leafIndex to guarantee leaf sequence order
  events.sort((a, b) => a.leafIndex - b.leafIndex);

  return events;
}

/**
 * Reconstructs the full, ordered array of commitments as BigInts.
 * Fills any indexing gaps with the default level-0 zero value.
 */
export async function reconstructCommitments(): Promise<bigint[]> {
  const events = await fetchDepositEvents();
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
