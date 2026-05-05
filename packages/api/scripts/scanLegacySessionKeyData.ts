/**
 * Read-only diagnostic for the Phase 2 deprecation window of the on-chain
 * legacy session-key path in PredictionMarketEscrow / SecondaryMarketEscrow.
 *
 * The legacy path activates when the relevant *SessionKeyData bytes argument
 * is non-empty. The factory-derivation check inside that path does not reflect
 * a smart account's current validator/owner, so it is being retired (see PR
 * security/secondary-erc1271-migration). Before the contract-side fix lands
 * we need empirical evidence that no live integrator still produces non-empty
 * blobs.
 *
 * For each chain + escrow contract (current and legacy deployments) the script
 * scans recent PredictionCreated / PositionsBurned / TradeExecuted events,
 * fetches the underlying transaction, decodes the entry-point function call,
 * and reports how many transactions still carry non-empty session-key bytes.
 *
 * Usage:
 *   pnpm --filter @sapience/api exec tsx \
 *     scripts/scanLegacySessionKeyData.ts \
 *     [--chainId 5064014] \
 *     [--fromBlock <number>] [--toBlock <number>] \
 *     [--lastBlocks 50000] \
 *     [--scope primary|secondary|both] \
 *     [--includeLegacy true|false]
 *
 * Defaults: chainId=5064014, scope=both, includeLegacy=true, lastBlocks=50000
 * (≈ 1 day on Ethereal). Output is a small per-(chain, contract, fn, from)
 * table plus a totals line. Exits non-zero only on RPC errors, never on
 * "found legacy traffic" — that is the signal you came for.
 */
import {
  decodeFunctionData,
  parseAbiItem,
  type Address,
  type Hex,
  type Log,
} from 'viem';
import {
  predictionMarketEscrow,
  secondaryMarketEscrow,
} from '@sapience/sdk/contracts';
import {
  predictionMarketEscrowAbi,
  secondaryMarketEscrowAbi,
} from '@sapience/sdk/abis';
import { getProviderForChain } from '../src/lib/utils';

type Scope = 'primary' | 'secondary' | 'both';

interface DeploymentEntry {
  address: Address;
  blockCreated: number;
  legacy: boolean;
}

const PREDICTION_CREATED = parseAbiItem(
  'event PredictionCreated(bytes32 indexed predictionId, address indexed predictor, address indexed counterparty, address predictorToken, address counterpartyToken, uint256 predictorCollateral, uint256 counterpartyCollateral, bytes32 refCode, bytes32 pickConfigId)'
);
const POSITIONS_BURNED = parseAbiItem(
  'event PositionsBurned(bytes32 indexed pickConfigId, address indexed predictorHolder, address indexed counterpartyHolder, uint256 predictorTokensBurned, uint256 counterpartyTokensBurned, uint256 predictorPayout, uint256 counterpartyPayout, bytes32 refCode)'
);
const TRADE_EXECUTED = parseAbiItem(
  'event TradeExecuted(bytes32 indexed tradeHash, address indexed seller, address indexed buyer, address token, address collateral, uint256 tokenAmount, uint256 price, bytes32 refCode)'
);

function parseFlag(name: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.split('=')[1];
  const idx = process.argv.indexOf(name);
  if (idx > 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function parseNum(name: string, fallback: number): number {
  const raw = parseFlag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }
  return n;
}

function parseBool(name: string, fallback: boolean): boolean {
  const raw = parseFlag(name);
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function parseScope(): Scope {
  const raw = parseFlag('--scope') ?? 'both';
  if (raw !== 'primary' && raw !== 'secondary' && raw !== 'both') {
    throw new Error(`--scope must be primary|secondary|both, got: ${raw}`);
  }
  return raw;
}

function isNonEmptyHex(blob: Hex | undefined | null): boolean {
  return typeof blob === 'string' && blob.length > 2;
}

function entriesFromAddressMap(
  map: typeof predictionMarketEscrow,
  chainId: number
): DeploymentEntry[] {
  const entry = map[chainId];
  if (!entry) return [];
  const out: DeploymentEntry[] = [
    {
      address: entry.address,
      blockCreated: entry.blockCreated ?? 0,
      legacy: false,
    },
  ];
  for (const l of entry.legacy ?? []) {
    if (typeof l === 'string') {
      out.push({ address: l as Address, blockCreated: 0, legacy: true });
    } else {
      out.push({
        address: l.address,
        blockCreated: l.blockCreated,
        legacy: true,
      });
    }
  }
  return out;
}

interface RowKey {
  contract: Address;
  isLegacyDeployment: boolean;
  fn: string;
  from: Address;
}

function rowKey(k: RowKey): string {
  return `${k.contract.toLowerCase()}|${k.isLegacyDeployment}|${k.fn}|${k.from.toLowerCase()}`;
}

interface RowAgg {
  key: RowKey;
  legacyCalls: number;
  totalCalls: number;
  firstSeenBlock: number;
  lastSeenBlock: number;
  sampleTxs: string[];
}

async function fetchLogsChunked(
  client: ReturnType<typeof getProviderForChain>,
  address: Address,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  fromBlock: bigint,
  toBlock: bigint,
  initialChunk = 5_000n
): Promise<Log[]> {
  const out: Log[] = [];
  let cursor = fromBlock;
  let chunk = initialChunk;
  while (cursor <= toBlock) {
    const end = cursor + chunk - 1n > toBlock ? toBlock : cursor + chunk - 1n;
    try {
      const logs = await client.getLogs({
        address,
        event,
        fromBlock: cursor,
        toBlock: end,
      });
      out.push(...(logs as Log[]));
      cursor = end + 1n;
      // Recover chunk size after a successful pull
      if (chunk < initialChunk) chunk = chunk * 2n;
    } catch (err) {
      console.warn(
        `[scan] getLogs failed for ${address} ${cursor}..${end}: ${
          (err as Error).message
        } — halving chunk`
      );
      if (chunk <= 256n) throw err;
      chunk = chunk / 2n;
    }
  }
  return out;
}

async function scanContract(
  scope: 'primary' | 'secondary',
  client: ReturnType<typeof getProviderForChain>,
  deployment: DeploymentEntry,
  fromBlock: bigint,
  toBlock: bigint,
  agg: Map<string, RowAgg>
): Promise<void> {
  const events =
    scope === 'primary'
      ? [PREDICTION_CREATED, POSITIONS_BURNED]
      : [TRADE_EXECUTED];
  const allLogs: Log[] = [];
  for (const event of events) {
    const logs = await fetchLogsChunked(
      client,
      deployment.address,
      event,
      fromBlock,
      toBlock
    );
    allLogs.push(...logs);
  }

  const txHashes = new Set<string>();
  for (const log of allLogs) {
    if (log.transactionHash) txHashes.add(log.transactionHash);
  }

  console.log(
    `[scan] scope=${scope} contract=${deployment.address} legacyDeployment=${deployment.legacy} ` +
      `events=${allLogs.length} uniqueTxs=${txHashes.size} blocks=${fromBlock}..${toBlock}`
  );

  for (const txHash of txHashes) {
    const tx = await client.getTransaction({ hash: txHash as Hex });
    const to = (tx.to ?? '0x0').toLowerCase();
    if (to !== deployment.address.toLowerCase()) {
      // Trade/mint dispatched via a router or aggregator — input does not
      // decode against the escrow ABI directly. Skip; the on-chain event
      // still tells us a settlement happened, but we cannot tell whether the
      // legacy bytes were used.
      continue;
    }

    let fn: string;
    let predictorBlob: Hex | undefined;
    let counterpartyBlob: Hex | undefined;
    let sellerBlob: Hex | undefined;
    let buyerBlob: Hex | undefined;
    try {
      if (scope === 'primary') {
        const decoded = decodeFunctionData({
          abi: predictionMarketEscrowAbi,
          data: tx.input,
        });
        fn = decoded.functionName;
        if (
          (fn === 'mint' || fn === 'burn') &&
          decoded.args &&
          decoded.args[0]
        ) {
          const req = decoded.args[0] as {
            predictorSessionKeyData?: Hex;
            counterpartySessionKeyData?: Hex;
          };
          predictorBlob = req.predictorSessionKeyData;
          counterpartyBlob = req.counterpartySessionKeyData;
        } else {
          continue;
        }
      } else {
        const decoded = decodeFunctionData({
          abi: secondaryMarketEscrowAbi,
          data: tx.input,
        });
        fn = decoded.functionName;
        if (fn === 'executeTrade' && decoded.args && decoded.args[0]) {
          const req = decoded.args[0] as {
            sellerSessionKeyData?: Hex;
            buyerSessionKeyData?: Hex;
          };
          sellerBlob = req.sellerSessionKeyData;
          buyerBlob = req.buyerSessionKeyData;
        } else {
          continue;
        }
      }
    } catch (err) {
      // Wrapper or unrelated entrypoint
      continue;
    }

    const blobs = [
      ['predictor', predictorBlob],
      ['counterparty', counterpartyBlob],
      ['seller', sellerBlob],
      ['buyer', buyerBlob],
    ] as const;

    const isLegacyTx = blobs.some(([, blob]) => isNonEmptyHex(blob));
    const k: RowKey = {
      contract: deployment.address,
      isLegacyDeployment: deployment.legacy,
      fn,
      from: tx.from as Address,
    };
    const key = rowKey(k);
    const existing = agg.get(key);
    const blockNum = Number(tx.blockNumber ?? 0n);
    if (existing) {
      existing.totalCalls += 1;
      if (isLegacyTx) {
        existing.legacyCalls += 1;
        if (existing.sampleTxs.length < 5) existing.sampleTxs.push(txHash);
      }
      if (blockNum > 0 && blockNum < existing.firstSeenBlock) {
        existing.firstSeenBlock = blockNum;
      }
      if (blockNum > existing.lastSeenBlock) {
        existing.lastSeenBlock = blockNum;
      }
    } else {
      agg.set(key, {
        key: k,
        totalCalls: 1,
        legacyCalls: isLegacyTx ? 1 : 0,
        firstSeenBlock: blockNum,
        lastSeenBlock: blockNum,
        sampleTxs: isLegacyTx ? [txHash] : [],
      });
    }
  }
}

async function main(): Promise<void> {
  const chainId = parseNum('--chainId', 5064014);
  const scope = parseScope();
  const includeLegacy = parseBool('--includeLegacy', true);
  const lastBlocks = parseNum('--lastBlocks', 50_000);

  const client = getProviderForChain(chainId);
  const head = await client.getBlockNumber();
  const fromBlockArg = parseFlag('--fromBlock');
  const toBlockArg = parseFlag('--toBlock');
  const toBlock = toBlockArg ? BigInt(toBlockArg) : head;
  const fromBlock = fromBlockArg
    ? BigInt(fromBlockArg)
    : toBlock - BigInt(lastBlocks) + 1n;

  if (fromBlock < 0n || fromBlock > toBlock) {
    throw new Error(`Invalid block window: ${fromBlock}..${toBlock}`);
  }

  console.log(
    `[scan] chainId=${chainId} scope=${scope} blocks=${fromBlock}..${toBlock} (head=${head}, includeLegacy=${includeLegacy})`
  );

  const targets: Array<{
    scope: 'primary' | 'secondary';
    entry: DeploymentEntry;
  }> = [];

  if (scope === 'primary' || scope === 'both') {
    for (const e of entriesFromAddressMap(predictionMarketEscrow, chainId)) {
      if (!includeLegacy && e.legacy) continue;
      targets.push({ scope: 'primary', entry: e });
    }
  }
  if (scope === 'secondary' || scope === 'both') {
    for (const e of entriesFromAddressMap(secondaryMarketEscrow, chainId)) {
      if (!includeLegacy && e.legacy) continue;
      targets.push({ scope: 'secondary', entry: e });
    }
  }

  if (targets.length === 0) {
    throw new Error(
      `No escrow deployments found for chainId=${chainId} scope=${scope}.`
    );
  }

  const agg = new Map<string, RowAgg>();
  for (const t of targets) {
    const startBlock =
      t.entry.blockCreated > 0 && BigInt(t.entry.blockCreated) > fromBlock
        ? BigInt(t.entry.blockCreated)
        : fromBlock;
    if (startBlock > toBlock) continue;
    await scanContract(t.scope, client, t.entry, startBlock, toBlock, agg);
  }

  const rows = Array.from(agg.values()).sort(
    (a, b) => b.legacyCalls - a.legacyCalls || b.totalCalls - a.totalCalls
  );
  let totalLegacy = 0;
  let totalCalls = 0;
  console.log('');
  console.log(
    'contract                                    legacy?  fn          legacyCalls totalCalls  from                                       firstBlk  lastBlk'
  );
  console.log('-'.repeat(160));
  for (const r of rows) {
    totalLegacy += r.legacyCalls;
    totalCalls += r.totalCalls;
    const contract = r.key.contract.toLowerCase();
    const from = r.key.from.toLowerCase();
    console.log(
      `${contract}  ${String(r.key.isLegacyDeployment).padEnd(7)}  ${r.key.fn.padEnd(11)} ${String(
        r.legacyCalls
      ).padStart(11)} ${String(r.totalCalls).padStart(10)}  ${from}  ${String(
        r.firstSeenBlock
      ).padStart(8)}  ${String(r.lastSeenBlock).padStart(8)}`
    );
    if (r.sampleTxs.length > 0) {
      console.log(`    sample tx: ${r.sampleTxs.join(', ')}`);
    }
  }
  console.log('-'.repeat(160));
  console.log(
    `TOTAL: legacyCalls=${totalLegacy} totalCalls=${totalCalls} legacyShare=${
      totalCalls > 0 ? ((100 * totalLegacy) / totalCalls).toFixed(2) : '0.00'
    }%`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
