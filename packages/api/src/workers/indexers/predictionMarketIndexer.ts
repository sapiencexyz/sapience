import prisma from '../../db';
import { getProviderForChain, getBlockByTimestamp } from '../../utils/utils';
import {
  type PublicClient,
  decodeEventLog,
  decodeAbiParameters,
  encodeAbiParameters,
  type Log,
  type Block,
  keccak256,
  toHex,
} from 'viem';
import Sentry from '../../instrument';
import { IIndexer } from '../../interfaces';

// TODO: Move all of this code to the existsing event processing pipeline
const BLOCK_BATCH_SIZE = 100;
import { predictionMarket, lzPMResolver, lzUmaResolver } from '@sapience/sdk';

/**
 * Pyth markets are synthetic placeholders created from on-chain Pyth outcomes.
 * We want them to display like the old Hermes-wired UX (human label, not bytes32).
 *
 * On-chain PythResolver encodes a **Lazer uint32 feed id** in the low bits of a bytes32.
 * We resolve that id to a symbol using the Lazer symbols endpoint and cache in-memory.
 */
type PythLazerSymbolRow = {
  pyth_lazer_id?: unknown;
  symbol?: unknown;
  description?: unknown;
};

let cachedPythLazerSymbolMap: Map<number, string> | null = null;
let inflightPythLazerSymbolMap: Promise<Map<number, string>> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getArrayProp(
  obj: Record<string, unknown>,
  key: string
): unknown[] | null {
  const v = obj[key];
  return Array.isArray(v) ? v : null;
}

function tryParseUint32(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    if (value < 0 || value > 0xffff_ffff) return null;
    return value;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  try {
    if (/^\d+$/.test(s)) {
      const v = BigInt(s);
      if (v > 0xffff_ffffn) return null;
      return Number(v);
    }
    const hex = s.startsWith('0x') ? s : `0x${s}`;
    if (/^0x[0-9a-fA-F]{1,8}$/.test(hex)) {
      const v = BigInt(hex);
      if (v > 0xffff_ffffn) return null;
      return Number(v);
    }
  } catch {
    return null;
  }
  return null;
}

function decodePythLazerIdFromBytes32(priceId: string): number | null {
  const s = String(priceId ?? '').trim();
  if (!s) return null;
  // priceId is usually bytes32 hex. If it isn't, allow parsing decimal/short-hex as a convenience.
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) return tryParseUint32(s);
  try {
    const v = BigInt(s);
    if (v > 0xffff_ffffn) return null;
    return Number(v);
  } catch {
    return null;
  }
}

function tryExtractPythLazerRows(json: unknown): PythLazerSymbolRow[] {
  const candidates: unknown[] = Array.isArray(json)
    ? json
    : isRecord(json)
      ? (getArrayProp(json, 'data') ?? getArrayProp(json, 'symbols') ?? [])
      : [];
  const out: PythLazerSymbolRow[] = [];
  for (const item of candidates) {
    out.push({
      pyth_lazer_id: isRecord(item) ? item['pyth_lazer_id'] : undefined,
      symbol: isRecord(item) ? item['symbol'] : undefined,
      description: isRecord(item) ? item['description'] : undefined,
    });
  }
  return out;
}

async function loadPythLazerSymbolMap(): Promise<Map<number, string>> {
  if (cachedPythLazerSymbolMap) return cachedPythLazerSymbolMap;
  if (inflightPythLazerSymbolMap) return inflightPythLazerSymbolMap;

  inflightPythLazerSymbolMap = (async () => {
    const res = await fetch(
      'https://history.pyth-lazer.dourolabs.app/history/v1/symbols'
    );
    if (!res.ok) throw new Error(`Pyth Lazer symbols failed (${res.status})`);
    const json = (await res.json()) as unknown;
    const rows = tryExtractPythLazerRows(json);
    const map = new Map<number, string>();
    for (const r of rows) {
      const id = tryParseUint32(r.pyth_lazer_id);
      if (typeof id !== 'number') continue;
      const sym = typeof r.symbol === 'string' ? r.symbol.trim() : '';
      const desc =
        typeof r.description === 'string' ? r.description.trim() : '';
      const label = sym.length > 0 ? sym : desc.length > 0 ? desc : null;
      if (label) map.set(id, label);
    }
    cachedPythLazerSymbolMap = map;
    return map;
  })();

  try {
    return await inflightPythLazerSymbolMap;
  } finally {
    inflightPythLazerSymbolMap = null;
  }
}

async function resolvePythSyntheticQuestion(priceId: string): Promise<string> {
  const lazerId = decodePythLazerIdFromBytes32(priceId);
  if (typeof lazerId !== 'number') return `Pyth market ${priceId}`;
  try {
    const map = await loadPythLazerSymbolMap();
    return map.get(lazerId) ?? `Pyth Pro #${lazerId}`;
  } catch {
    return `Pyth Pro #${lazerId}`;
  }
}

function formatPythDecimalFromInt(priceInt: bigint, expo: number): string {
  const sign = priceInt < 0n ? '-' : '';
  const digits = (priceInt < 0n ? -priceInt : priceInt).toString(10);
  if (!digits || /^0+$/.test(digits)) return '0';

  if (expo >= 0) return `${sign}${digits}${'0'.repeat(expo)}`;

  const places = Math.abs(expo);
  let out: string;
  if (digits.length <= places) {
    out = `0.${'0'.repeat(places - digits.length)}${digits}`;
  } else {
    const i = digits.length - places;
    out = `${digits.slice(0, i)}.${digits.slice(i)}`;
  }
  out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign + out;
}

function buildPythLegDescriptor(params: {
  priceId: string;
  endTimeSec: number;
  strikePrice: bigint;
  strikeExpo: number;
  overWinsOnTie: boolean;
}): string {
  // Keep a stable machine-readable prefix so the app can render OVER/UNDER $X like before.
  // Note: strikePrice is the on-chain int64 with strikeExpo (int32).
  return [
    'PYTH_LAZER',
    `priceId=${String(params.priceId).toLowerCase()}`,
    `endTime=${Math.floor(params.endTimeSec)}`,
    `strikePrice=${params.strikePrice.toString()}`,
    `strikeExpo=${Number(params.strikeExpo)}`,
    `overWinsOnTie=${params.overWinsOnTie ? '1' : '0'}`,
    `strikeDecimal=${formatPythDecimalFromInt(params.strikePrice, params.strikeExpo)}`,
  ].join('|');
}

// PredictionMarket contract ABI for the events we want to index
const PREDICTION_MARKET_ABI = [
  {
    type: 'event',
    name: 'MarketSubmittedToUMA',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'assertionId', type: 'bytes32', indexed: true },
      { name: 'asserter', type: 'address', indexed: false },
      { name: 'claim', type: 'bytes', indexed: false },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'resolvedToYes', type: 'bool', indexed: false },
      { name: 'assertedTruthfully', type: 'bool', indexed: false },
      { name: 'resolutionTime', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionMinted',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionBurned',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerNftTokenId', type: 'uint256', indexed: false },
      { name: 'takerNftTokenId', type: 'uint256', indexed: false },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'makerWon', type: 'bool', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PredictionConsolidated',
    inputs: [
      { name: 'makerNftTokenId', type: 'uint256', indexed: true },
      { name: 'takerNftTokenId', type: 'uint256', indexed: true },
      { name: 'totalCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderPlaced',
    inputs: [
      { name: 'maker', type: 'address', indexed: true },
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'resolver', type: 'address', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderFilled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
      { name: 'refCode', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'encodedPredictedOutcomes', type: 'bytes', indexed: false },
      { name: 'makerCollateral', type: 'uint256', indexed: false },
      { name: 'takerCollateral', type: 'uint256', indexed: false },
    ],
  },
] as const;

// Minimal ABI for reading the canonical resolver address from on-chain storage.
// NOTE: The PredictionMinted event does NOT include resolver, so we must read it.
const PREDICTION_MARKET_READ_ABI = [
  {
    type: 'function',
    name: 'getPrediction',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'predictionData',
        type: 'tuple',
        components: [
          { name: 'predictionId', type: 'uint256' },
          { name: 'makerNftTokenId', type: 'uint256' },
          { name: 'takerNftTokenId', type: 'uint256' },
          { name: 'makerCollateral', type: 'uint256' },
          { name: 'takerCollateral', type: 'uint256' },
          { name: 'encodedPredictedOutcomes', type: 'bytes' },
          { name: 'resolver', type: 'address' },
          { name: 'maker', type: 'address' },
          { name: 'taker', type: 'address' },
          { name: 'settled', type: 'bool' },
          { name: 'makerWon', type: 'bool' },
        ],
      },
    ],
  },
] as const;

// (no read ABI needed with on-event decoding)

// Event signatures for filtering - using keccak256 hashes instead

type PredictionMintedEvent = {
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  makerCollateral: bigint;
  takerCollateral: bigint;
  totalCollateral: bigint;
  refCode: string;
};

interface PredictionBurnedEvent {
  maker: string;
  taker: string;
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  makerWon: boolean;
  refCode: string;
}

interface PredictionConsolidatedEvent {
  makerNftTokenId: bigint;
  takerNftTokenId: bigint;
  totalCollateral: bigint;
  refCode: string;
}

interface OrderPlacedEvent {
  maker: string;
  orderId: bigint;
  encodedPredictedOutcomes: `0x${string}`;
  resolver: string;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

interface OrderFilledEvent {
  orderId: bigint;
  maker: string;
  taker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
  refCode: string;
}

interface OrderCancelledEvent {
  orderId: bigint;
  maker: string;
  encodedPredictedOutcomes: `0x${string}`;
  makerCollateral: bigint;
  takerCollateral: bigint;
}

interface MarketResolvedEvent {
  marketId: string;
  resolvedToYes: boolean;
  assertedTruthfully: boolean;
  resolutionTime: bigint;
}

interface MarketSubmittedToUMAEvent {
  marketId: string;
  assertionId: string;
  asserter: string;
  claim: `0x${string}`;
  resolvedToYes: boolean;
}

class PredictionMarketIndexer implements IIndexer {
  public client: PublicClient;
  private isWatching: boolean = false;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private resolverAddress: `0x${string}` | undefined;
  private sigintHandler: (() => void) | null = null;
  private currentUnwatch: (() => void) | null = null;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.client = getProviderForChain(chainId);

    // Get the contract address for this specific chain
    const contractEntry = predictionMarket[chainId];
    if (!contractEntry?.address) {
      throw new Error(
        `PredictionMarket contract not deployed on chain ${chainId}. Available chains: ${Object.keys(predictionMarket).join(', ')}`
      );
    }
    this.contractAddress = contractEntry.address as `0x${string}`;

    // Get the resolver address if available
    const pmResolverEntry = lzPMResolver[chainId as keyof typeof lzPMResolver];
    const umaResolverEntry =
      lzUmaResolver[chainId as keyof typeof lzUmaResolver];

    if (pmResolverEntry?.address) {
      this.resolverAddress = pmResolverEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found PM resolver address for chain ${chainId}: ${this.resolverAddress}`
      );
    } else if (umaResolverEntry?.address) {
      this.resolverAddress = umaResolverEntry.address as `0x${string}`;
      console.log(
        `[PredictionMarketIndexer] Found UMA resolver address for chain ${chainId}: ${this.resolverAddress}`
      );
    }
  }

  async indexBlockPriceFromTimestamp(
    resourceSlug: string,
    startTimestamp: number,
    endTimestamp?: number
  ): Promise<boolean> {
    try {
      const addressesInfo = this.resolverAddress
        ? `contracts ${this.contractAddress} and resolver ${this.resolverAddress}`
        : `contract ${this.contractAddress}`;
      console.log(
        `[PredictionMarketIndexer:${this.chainId}] Indexing blocks from timestamp ${startTimestamp} to ${endTimestamp || 'latest'} on ${addressesInfo}`
      );

      // Use binary search to find the exact blocks for the timestamps
      const startBlock = await getBlockByTimestamp(this.client, startTimestamp);
      console.log(
        `[PredictionMarketIndexer] Found start block: ${startBlock.number} at timestamp ${startBlock.timestamp}`
      );

      let endBlock: Block;
      if (endTimestamp) {
        endBlock = await getBlockByTimestamp(this.client, endTimestamp);
        console.log(
          `[PredictionMarketIndexer] Found end block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      } else {
        // If no end timestamp provided, use the latest block
        endBlock = await this.client.getBlock({ blockTag: 'latest' });
        console.log(
          `[PredictionMarketIndexer] Using latest block: ${endBlock.number} at timestamp ${endBlock.timestamp}`
        );
      }

      // Create array of block numbers to index
      const startBlockNumber = Number(startBlock.number);
      const endBlockNumber = Number(endBlock.number);
      const blockNumbers: number[] = [];

      // Process blocks in batches to avoid overwhelming the RPC
      for (
        let i = startBlockNumber;
        i <= endBlockNumber;
        i += BLOCK_BATCH_SIZE
      ) {
        const batchEnd = Math.min(i + BLOCK_BATCH_SIZE - 1, endBlockNumber);
        const batch = Array.from(
          { length: batchEnd - i + 1 },
          (_, idx) => i + idx
        );
        blockNumbers.push(...batch);
      }

      console.log(
        `[PredictionMarketIndexer] Indexing ${blockNumbers.length} blocks from ${startBlockNumber} to ${endBlockNumber}`
      );
      return await this.indexBlocks(resourceSlug, blockNumbers);
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error indexing from timestamp:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  async indexBlocks(_resourceSlug: string, blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Indexing ${blocks.length} blocks: ${blocks[0]} to ${blocks[blocks.length - 1]}`
      );

      // For reindexing large ranges, use optimized batch processing
      if (blocks.length > 1000) {
        return await this.indexBlocksOptimized(blocks);
      }

      for (const blockNumber of blocks) {
        await this.indexBlock(blockNumber);
      }

      return true;
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error indexing blocks:', error);
      Sentry.captureException(error);
      return false;
    }
  }
  private async indexBlocksOptimized(blocks: number[]): Promise<boolean> {
    try {
      console.log(
        `[PredictionMarketIndexer] Using optimized batch processing for ${blocks.length} blocks`
      );

      const CHUNK_SIZE = 10000;
      let processedBlocks = 0;

      for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunk = blocks.slice(i, i + CHUNK_SIZE);
        const fromBlock = chunk[0];
        const toBlock = chunk[chunk.length - 1];

        console.log(
          `[PredictionMarketIndexer] Processing chunk: blocks ${fromBlock} to ${toBlock} (${chunk.length} blocks)`
        );

        try {
          // Single efficient query for the entire chunk
          // Include both PM contract and resolver address if available
          const addresses: `0x${string}`[] = [
            this.contractAddress as `0x${string}`,
          ];
          if (this.resolverAddress) {
            addresses.push(this.resolverAddress as `0x${string}`);
          }
          const logs = await this.client.getLogs({
            address: addresses,
            fromBlock: BigInt(fromBlock),
            toBlock: BigInt(toBlock),
          });

          console.log(
            `[PredictionMarketIndexer] Found ${logs.length} logs in chunk ${fromBlock}-${toBlock}`
          );

          // Process all logs in this chunk
          for (const log of logs) {
            try {
              // Get block info only when we have a relevant log
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber!,
                includeTransactions: false,
              });
              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
              Sentry.captureException(logError);
              // Continue processing other logs
            }
          }

          processedBlocks += chunk.length;
          console.log(
            `[PredictionMarketIndexer] Progress: ${processedBlocks}/${blocks.length} blocks (${Math.round((processedBlocks / blocks.length) * 100)}%)`
          );
        } catch (chunkError) {
          console.error(
            `[PredictionMarketIndexer] Error processing chunk ${fromBlock}-${toBlock}:`,
            chunkError
          );
          Sentry.captureException(chunkError);

          // fallback
          console.log(
            `[PredictionMarketIndexer] Falling back to individual block processing for chunk ${fromBlock}-${toBlock}`
          );
          for (const blockNumber of chunk) {
            await this.indexBlock(blockNumber);
          }
          processedBlocks += chunk.length;
        }
      }

      return true;
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error in optimized indexing:',
        error
      );
      Sentry.captureException(error);
      return false;
    }
  }

  private async indexBlock(blockNumber: number): Promise<void> {
    try {
      const block = await this.client.getBlock({
        blockNumber: BigInt(blockNumber),
        includeTransactions: false,
      });

      // Get logs for the PredictionMarket contract and resolver (if available)
      const addresses: `0x${string}`[] = [
        this.contractAddress as `0x${string}`,
      ];
      if (this.resolverAddress) {
        addresses.push(this.resolverAddress as `0x${string}`);
      }
      const logs = await this.client.getLogs({
        address: addresses,
        fromBlock: BigInt(blockNumber),
        toBlock: BigInt(blockNumber),
      });

      for (const log of logs) {
        try {
          await this.processLog(log, block);
        } catch (logError) {
          console.error(
            `[PredictionMarketIndexer] Error processing individual log in indexBlock:`,
            logError
          );
          Sentry.captureException(logError);
          // Continue processing other logs
        }
      }
    } catch (error) {
      console.error(
        `[PredictionMarketIndexer] Error indexing block ${blockNumber}:`,
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processLog(log: Log, block: Block): Promise<void> {
    try {
      console.log(
        `[PredictionMarketIndexer] Processing log: ${log.address} logIndex: ${log.logIndex}`
      );
      // Check if this is a PredictionMarket event
      const addressesToCheck = [this.contractAddress];
      if (this.resolverAddress) {
        addressesToCheck.push(this.resolverAddress);
      }

      if (
        !addressesToCheck
          .map((a) => a.toLowerCase())
          .includes(log.address.toLowerCase())
      ) {
        console.log(
          `[PredictionMarketIndexer] Skipping log: ${log.address} is not the PredictionMarket or Resolver contract`
        );
        return;
      }

      // Decode the event based on the topic
      const predictionMintedTopic = keccak256(
        toHex(
          'PredictionMinted(address,address,bytes,uint256,uint256,uint256,uint256,uint256,bytes32)'
        )
      );
      const predictionBurnedTopic = keccak256(
        toHex(
          'PredictionBurned(address,address,bytes,uint256,uint256,uint256,bool,bytes32)'
        )
      );
      const predictionConsolidatedTopic = keccak256(
        toHex('PredictionConsolidated(uint256,uint256,uint256,bytes32)')
      );
      const orderPlacedTopic = keccak256(
        toHex(
          'OrderPlaced(address,uint256,bytes,address,uint256,uint256,bytes32)'
        )
      );
      const orderFilledTopic = keccak256(
        toHex(
          'OrderFilled(uint256,address,address,bytes,uint256,uint256,bytes32)'
        )
      );
      const orderCancelledTopic = keccak256(
        toHex('OrderCancelled(uint256,address,bytes,uint256,uint256)')
      );
      const marketResolvedTopic = keccak256(
        toHex('MarketResolved(bytes32,bool,bool,uint256)')
      );
      const marketSubmittedToUMATopic = keccak256(
        toHex('MarketSubmittedToUMA(bytes32,bytes32,address,bytes,bool)')
      );

      if (log.topics[0] === predictionMintedTopic) {
        await this.processPredictionMinted(log, block);
      } else if (log.topics[0] === predictionBurnedTopic) {
        await this.processPredictionBurned(log, block);
      } else if (log.topics[0] === predictionConsolidatedTopic) {
        await this.processPredictionConsolidated(log, block);
      } else if (log.topics[0] === orderPlacedTopic) {
        await this.processOrderPlaced(log, block);
      } else if (log.topics[0] === orderFilledTopic) {
        await this.processOrderFilled(log, block);
      } else if (log.topics[0] === orderCancelledTopic) {
        await this.processOrderCancelled(log, block);
      } else if (log.topics[0] === marketResolvedTopic) {
        await this.processMarketResolved(log, block);
      } else if (log.topics[0] === marketSubmittedToUMATopic) {
        await this.processMarketSubmittedToUMA(log, block);
      }
    } catch (error) {
      console.error('[PredictionMarketIndexer] Error processing log:', error);
      Sentry.captureException(error);
    }
  }

  private async processPredictionMinted(log: Log, block: Block): Promise<void> {
    try {
      const decodedAny = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionMintedEvent };

      const eventData = {
        eventType: 'PredictionMinted',
        maker: decodedAny.args.maker,
        taker: decodedAny.args.taker,
        makerNftTokenId: decodedAny.args.makerNftTokenId.toString(),
        takerNftTokenId: decodedAny.args.takerNftTokenId.toString(),
        makerCollateral: decodedAny.args.makerCollateral.toString(),
        takerCollateral: decodedAny.args.takerCollateral.toString(),
        totalCollateral: decodedAny.args.totalCollateral.toString(),
        refCode: decodedAny.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const encodedPredictedOutcomes = decodedAny.args
        .encodedPredictedOutcomes as `0x${string}`;

      // IMPORTANT: PredictionMinted does NOT include the resolver address. The indexer used to
      // fall back to a chain-level default (lzPMResolver/lzUmaResolver), which makes Condition.resolver
      // incorrect for Pyth markets. Instead, read the resolver from on-chain storage at the log's block.
      let predictionResolver =
        this.resolverAddress?.toLowerCase() ?? log.address.toLowerCase();
      try {
        const tokenId = decodedAny.args.makerNftTokenId as bigint;
        const pred = (await this.client.readContract({
          address: log.address as `0x${string}`,
          abi: PREDICTION_MARKET_READ_ABI,
          functionName: 'getPrediction',
          args: [tokenId],
          blockNumber: log.blockNumber ?? undefined,
        })) as unknown;
        const resolverMaybe = (pred as { resolver?: unknown } | null)?.resolver;
        if (
          typeof resolverMaybe === 'string' &&
          resolverMaybe.startsWith('0x')
        ) {
          predictionResolver = resolverMaybe.toLowerCase();
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed to read getPrediction().resolver; falling back to configured resolver:',
          e
        );
      }

      let predictedOutcomes: Array<{
        conditionId: string;
        prediction: boolean;
      }> = [];

      // Compute endsAt from decoded leg(s)
      let endsAt: number | null = null;

      // Decode outcomes.
      // - UMA resolver uses: tuple[](bytes32 marketId, bool prediction)
      // - Pyth resolver uses: tuple[](bytes32 priceId, uint64 endTime, int64 strikePrice, int32 strikeExpo, bool overWinsOnTie, bool prediction)
      try {
        const [outcomes] = decodeAbiParameters(
          [
            {
              type: 'tuple[]',
              components: [{ type: 'bytes32' }, { type: 'bool' }],
            },
          ],
          encodedPredictedOutcomes
        ) as unknown as [[`0x${string}`, boolean][]];

        predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
          conditionId: String(marketId).toLowerCase(),
          prediction,
        }));

        // UMA-style endsAt: compute from existing Condition.endTime values
        try {
          const conditionIds = predictedOutcomes.map((o) => o.conditionId);
          const matched = await prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            select: { id: true, endTime: true },
          });
          if (matched.length > 0) {
            endsAt = matched.reduce(
              (max, c) => (c.endTime > max ? c.endTime : max),
              matched[0].endTime
            );
          }
        } catch (e) {
          console.warn(
            '[PredictionMarketIndexer] Failed computing endsAt from conditions:',
            e
          );
        }
      } catch {
        // Pyth-style: compute marketId and endsAt directly from tuple contents.
        const [outcomes] = decodeAbiParameters(
          [
            {
              type: 'tuple[]',
              components: [
                { type: 'bytes32' }, // priceId
                { type: 'uint64' }, // endTime
                { type: 'int64' }, // strikePrice
                { type: 'int32' }, // strikeExpo
                { type: 'bool' }, // overWinsOnTie
                { type: 'bool' }, // prediction
              ],
            },
          ],
          encodedPredictedOutcomes
        ) as unknown as [
          Array<[`0x${string}`, bigint, bigint, bigint, boolean, boolean]>,
        ];

        const legs = outcomes.map(
          ([
            priceId,
            endTime,
            strikePrice,
            strikeExpo,
            overWinsOnTie,
            pred,
          ]) => {
            const strikeExpoNum = Number(strikeExpo);
            const marketId = keccak256(
              encodeAbiParameters(
                [
                  { type: 'bytes32' },
                  { type: 'uint64' },
                  { type: 'int64' },
                  { type: 'int32' },
                  { type: 'bool' },
                ],
                [priceId, endTime, strikePrice, strikeExpoNum, overWinsOnTie]
              )
            );

            return {
              marketId,
              priceId,
              endTimeSec: Number(endTime),
              prediction: !!pred,
            };
          }
        );

        predictedOutcomes = legs.map((l) => ({
          conditionId: String(l.marketId).toLowerCase(),
          prediction: l.prediction,
        }));

        endsAt =
          legs.length > 0
            ? legs.reduce(
                (max, l) => (l.endTimeSec > max ? l.endTimeSec : max),
                legs[0].endTimeSec
              )
            : null;

        // Ensure referenced Conditions exist so Prediction rows can be created (FK constraint).
        // These are synthetic placeholders for Pyth markets; keep them non-public so they
        // don't pollute the "Markets" list.
        const pythQuestionByPriceId = new Map<string, string>();
        for (const l of legs) {
          const id = String(l.marketId).toLowerCase();
          const endTimeInt =
            Number.isFinite(l.endTimeSec) && l.endTimeSec > 0
              ? Math.floor(l.endTimeSec)
              : null;
          if (!endTimeInt) continue;
          const priceIdLower = String(l.priceId).toLowerCase();
          const q =
            pythQuestionByPriceId.get(priceIdLower) ??
            (await resolvePythSyntheticQuestion(String(l.priceId)));
          pythQuestionByPriceId.set(priceIdLower, q);

          // Re-decode the full leg tuple so we can persist strike info for UI rendering.
          // This is safe because it's sourced from the same encoded payload.
          const match = outcomes.find(
            (o) => String(o[0]).toLowerCase() === priceIdLower
          );
          const strikePrice = match ? (match[2] as bigint) : 0n;
          const strikeExpoNum = match ? Number(match[3] as bigint) : 0;
          const overWinsOnTie = match ? Boolean(match[4] as boolean) : true;
          const pythDescriptor = buildPythLegDescriptor({
            priceId: String(l.priceId),
            endTimeSec: l.endTimeSec,
            strikePrice,
            strikeExpo: strikeExpoNum,
            overWinsOnTie,
          });

          await prisma.condition.upsert({
            where: { id },
            create: {
              id,
              question: q,
              shortName: null,
              categoryId: null,
              endTime: endTimeInt,
              public: false,
              claimStatement: `PYTH:${String(l.priceId).toLowerCase()}`,
              description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
              similarMarkets: [],
              chainId: this.chainId,
            },
            update: {
              // Keep endTime aligned (should be stable)
              endTime: endTimeInt,
              // Keep question aligned so historical rows can be upgraded from the old placeholder.
              question: q,
              description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
              chainId: this.chainId,
            },
          });
        }
      }

      const conditionIds = predictedOutcomes.map((o) => o.conditionId);

      // Always update the canonical Condition resolver (latest observed wins),
      // even if we end up skipping writes due to existing events.
      try {
        if (conditionIds.length > 0) {
          await prisma.condition.updateMany({
            where: { id: { in: conditionIds } },
            data: { resolver: predictionResolver },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Condition.resolver:',
          e
        );
      }

      // Skip if this event already exists (avoid double-writing event and transaction)
      const uniqueEventKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingEvent = await prisma.event.findFirst({
        where: {
          transactionHash: uniqueEventKey.transactionHash,
          blockNumber: uniqueEventKey.blockNumber,
          logIndex: uniqueEventKey.logIndex,
        },
      });

      if (existingEvent) {
        console.log(
          `[PredictionMarketIndexer] Event already exists tx=${uniqueEventKey.transactionHash} block=${uniqueEventKey.blockNumber} logIndex=${uniqueEventKey.logIndex}`
        );

        // For reindexing: still check if position needs to be created (might be missing due to old bug)
        const existingPosition = await prisma.position.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            predictorNftTokenId: eventData.makerNftTokenId,
            counterpartyNftTokenId: eventData.takerNftTokenId,
          },
        });

        if (existingPosition) {
          console.log(
            `[PredictionMarketIndexer] Position already exists for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
          );
          return;
        } else {
          console.log(
            `[PredictionMarketIndexer] Event exists but position missing - creating position for NFTs ${eventData.makerNftTokenId}/${eventData.takerNftTokenId}`
          );
          // Continue to position creation logic below
        }
      } else {
        // Store new event in database
        await prisma.event.create({
          data: {
            blockNumber: Number(log.blockNumber || 0),
            transactionHash: log.transactionHash || '',
            timestamp: BigInt(block.timestamp),
            logIndex: log.logIndex || 0,
            logData: eventData,
          },
        });
      }
      const predictionLegsData = predictedOutcomes.map((outcome) => ({
        conditionId: outcome.conditionId,
        outcomeYes: outcome.prediction,
        chainId: this.chainId,
      }));

      // Create Position with normalized predictions
      await prisma.position.create({
        data: {
          chainId: this.chainId,
          marketAddress: log.address.toLowerCase(),
          predictor: eventData.maker.toLowerCase(),
          counterparty: eventData.taker.toLowerCase(),
          predictorNftTokenId: eventData.makerNftTokenId,
          counterpartyNftTokenId: eventData.takerNftTokenId,
          totalCollateral: eventData.totalCollateral,
          predictorCollateral: eventData.makerCollateral,
          counterpartyCollateral: eventData.takerCollateral,
          refCode: eventData.refCode,
          status: 'active',
          predictorWon: null,
          mintedAt: Number(block.timestamp),
          settledAt: null,
          endsAt: endsAt ?? null,
          predictions: {
            create: predictionLegsData,
          },
        },
      });

      // Update open interest for all conditions in this position
      const collateralStr = eventData.totalCollateral;
      for (const conditionId of conditionIds) {
        await prisma.$executeRaw`
          UPDATE condition 
          SET "openInterest" = (COALESCE("openInterest"::NUMERIC, 0) + ${collateralStr}::NUMERIC)::TEXT
          WHERE id = ${conditionId}
        `;
      }

      console.log(
        `[PredictionMarketIndexer] Processed PredictionMinted: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionMinted:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processPredictionBurned(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionBurnedEvent };

      const eventData = {
        eventType: 'PredictionBurned',
        maker: decoded.args.maker,
        taker: decoded.args.taker,
        makerNftTokenId: decoded.args.makerNftTokenId.toString(),
        takerNftTokenId: decoded.args.takerNftTokenId.toString(),
        totalCollateral: decoded.args.totalCollateral.toString(),
        makerWon: decoded.args.makerWon,
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const burnedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingBurned = await prisma.event.findFirst({
        where: {
          transactionHash: burnedKey.transactionHash,
          blockNumber: burnedKey.blockNumber,
          logIndex: burnedKey.logIndex,
        },
      });

      if (existingBurned) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate PredictionBurned event tx=${burnedKey.transactionHash} block=${burnedKey.blockNumber} logIndex=${burnedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      // Update Position status
      try {
        const position = await prisma.position.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            OR: [
              { predictorNftTokenId: eventData.makerNftTokenId },
              { counterpartyNftTokenId: eventData.takerNftTokenId },
            ],
          },
        });
        if (position) {
          await prisma.position.update({
            where: { id: position.id },
            data: {
              status: 'settled',
              predictorWon: eventData.makerWon,
              settledAt: Number(block.timestamp),
            },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Position on burn:',
          e
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed PredictionBurned: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}, winner: ${eventData.makerWon ? 'predictor' : 'counterparty'}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionBurned:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processPredictionConsolidated(
    log: Log,
    block: Block
  ): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: PredictionConsolidatedEvent };

      const eventData = {
        eventType: 'PredictionConsolidated',
        makerNftTokenId: decoded.args.makerNftTokenId.toString(),
        takerNftTokenId: decoded.args.takerNftTokenId.toString(),
        totalCollateral: decoded.args.totalCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const consolidatedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingConsolidated = await prisma.event.findFirst({
        where: {
          transactionHash: consolidatedKey.transactionHash,
          blockNumber: consolidatedKey.blockNumber,
          logIndex: consolidatedKey.logIndex,
        },
      });

      if (existingConsolidated) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate PredictionConsolidated event tx=${consolidatedKey.transactionHash} block=${consolidatedKey.blockNumber} logIndex=${consolidatedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      // Update Position status
      try {
        const position = await prisma.position.findFirst({
          where: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            OR: [
              { predictorNftTokenId: eventData.makerNftTokenId },
              { counterpartyNftTokenId: eventData.takerNftTokenId },
            ],
          },
        });
        if (position) {
          await prisma.position.update({
            where: { id: position.id },
            data: {
              status: 'consolidated',
              predictorWon: true,
              settledAt: Number(block.timestamp),
            },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Position on consolidate:',
          e
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed PredictionConsolidated: ${eventData.makerNftTokenId}, ${eventData.takerNftTokenId}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing PredictionConsolidated:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderPlaced(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderPlacedEvent };

      const eventData = {
        eventType: 'OrderPlaced',
        predictor: decoded.args.maker,
        orderId: decoded.args.orderId.toString(),
        resolver: decoded.args.resolver,
        predictorCollateral: decoded.args.makerCollateral.toString(),
        counterpartyCollateral: decoded.args.takerCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const orderPlacedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderPlaced = await prisma.event.findFirst({
        where: {
          transactionHash: orderPlacedKey.transactionHash,
          blockNumber: orderPlacedKey.blockNumber,
          logIndex: orderPlacedKey.logIndex,
        },
      });

      if (existingOrderPlaced) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderPlaced event tx=${orderPlacedKey.transactionHash} block=${orderPlacedKey.blockNumber} logIndex=${orderPlacedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      const encodedPredictedOutcomes = decoded.args
        .encodedPredictedOutcomes as `0x${string}`;

      let predictedOutcomes: Array<{
        conditionId: `0x${string}`;
        prediction: boolean;
      }> = [];

      try {
        const [outcomes] = decodeAbiParameters(
          [
            {
              type: 'tuple[]',
              components: [{ type: 'bytes32' }, { type: 'bool' }],
            },
          ],
          encodedPredictedOutcomes
        ) as unknown as [[`0x${string}`, boolean][]];
        predictedOutcomes = outcomes.map(([marketId, prediction]) => ({
          conditionId: String(marketId).toLowerCase() as `0x${string}`,
          prediction,
        }));
      } catch {
        const [outcomes] = decodeAbiParameters(
          [
            {
              type: 'tuple[]',
              components: [
                { type: 'bytes32' }, // priceId
                { type: 'uint64' }, // endTime
                { type: 'int64' }, // strikePrice
                { type: 'int32' }, // strikeExpo
                { type: 'bool' }, // overWinsOnTie
                { type: 'bool' }, // prediction
              ],
            },
          ],
          encodedPredictedOutcomes
        ) as unknown as [
          Array<[`0x${string}`, bigint, bigint, bigint, boolean, boolean]>,
        ];

        const legs = outcomes.map(
          ([
            priceId,
            endTime,
            strikePrice,
            strikeExpo,
            overWinsOnTie,
            pred,
          ]) => {
            const strikeExpoNum = Number(strikeExpo);
            const marketId = keccak256(
              encodeAbiParameters(
                [
                  { type: 'bytes32' },
                  { type: 'uint64' },
                  { type: 'int64' },
                  { type: 'int32' },
                  { type: 'bool' },
                ],
                [priceId, endTime, strikePrice, strikeExpoNum, overWinsOnTie]
              )
            );
            return {
              marketId,
              priceId,
              endTimeSec: Number(endTime),
              prediction: !!pred,
            };
          }
        );

        predictedOutcomes = legs.map((l) => ({
          conditionId: String(l.marketId).toLowerCase() as `0x${string}`,
          prediction: l.prediction,
        }));

        // Ensure referenced Conditions exist so Prediction rows can be created (FK constraint).
        const pythQuestionByPriceId = new Map<string, string>();
        for (const l of legs) {
          const id = String(l.marketId).toLowerCase();
          const endTimeInt =
            Number.isFinite(l.endTimeSec) && l.endTimeSec > 0
              ? Math.floor(l.endTimeSec)
              : null;
          if (!endTimeInt) continue;
          const priceIdLower = String(l.priceId).toLowerCase();
          const q =
            pythQuestionByPriceId.get(priceIdLower) ??
            (await resolvePythSyntheticQuestion(String(l.priceId)));
          pythQuestionByPriceId.set(priceIdLower, q);

          // Re-decode the full leg tuple so we can persist strike info for UI rendering.
          const match = outcomes.find(
            (o) => String(o[0]).toLowerCase() === priceIdLower
          );
          const strikePrice = match ? (match[2] as bigint) : 0n;
          const strikeExpoNum = match ? Number(match[3] as bigint) : 0;
          const overWinsOnTie = match ? Boolean(match[4] as boolean) : true;
          const pythDescriptor = buildPythLegDescriptor({
            priceId: String(l.priceId),
            endTimeSec: l.endTimeSec,
            strikePrice,
            strikeExpo: strikeExpoNum,
            overWinsOnTie,
          });

          await prisma.condition.upsert({
            where: { id },
            create: {
              id,
              question: q,
              shortName: null,
              categoryId: null,
              endTime: endTimeInt,
              public: false,
              claimStatement: `PYTH:${String(l.priceId).toLowerCase()}`,
              description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
              similarMarkets: [],
              chainId: this.chainId,
            },
            update: {
              endTime: endTimeInt,
              // Keep question aligned so historical rows can be upgraded from the old placeholder.
              question: q,
              description: `${pythDescriptor}\nSynthetic Pyth market (generated by predictionMarketIndexer)`,
              chainId: this.chainId,
            },
          });
        }
      }

      const predictionResolver = eventData.resolver.toLowerCase();
      const conditionIds = predictedOutcomes.map((o) => o.conditionId);

      // Keep canonical Condition resolver up to date (latest event wins)
      try {
        if (conditionIds.length > 0) {
          await prisma.condition.updateMany({
            where: { id: { in: conditionIds } },
            data: { resolver: predictionResolver },
          });
        }
      } catch (e) {
        console.warn(
          '[PredictionMarketIndexer] Failed updating Condition.resolver (OrderPlaced):',
          e
        );
      }

      const predictionLegsData = predictedOutcomes.map((outcome) => ({
        conditionId: outcome.conditionId,
        outcomeYes: outcome.prediction,
        chainId: this.chainId,
      }));

      try {
        await prisma.limitOrder.upsert({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
          create: {
            chainId: this.chainId,
            marketAddress: log.address.toLowerCase(),
            orderId: eventData.orderId,
            predictor: eventData.predictor.toLowerCase(),
            resolver: eventData.resolver.toLowerCase(),
            predictorCollateral: eventData.predictorCollateral,
            counterpartyCollateral: eventData.counterpartyCollateral,
            refCode: eventData.refCode,
            status: 'pending',
            placedAt: Number(block.timestamp),
            placedTxHash: log.transactionHash || '',
            predictions: {
              create: predictionLegsData,
            },
          },
          update: {
            predictor: eventData.predictor.toLowerCase(),
            resolver: eventData.resolver.toLowerCase(),
            predictorCollateral: eventData.predictorCollateral,
            counterpartyCollateral: eventData.counterpartyCollateral,
            refCode: eventData.refCode,
            placedAt: Number(block.timestamp),
            placedTxHash: log.transactionHash || '',
            predictions: {
              deleteMany: {},
              create: predictionLegsData,
            },
          },
        });
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to create LimitOrder:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderPlaced: orderId=${eventData.orderId}, predictor=${eventData.predictor}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderPlaced:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderFilled(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderFilledEvent };

      const eventData = {
        eventType: 'OrderFilled',
        orderId: decoded.args.orderId.toString(),
        predictor: decoded.args.maker,
        counterparty: decoded.args.taker,
        predictorCollateral: decoded.args.makerCollateral.toString(),
        counterpartyCollateral: decoded.args.takerCollateral.toString(),
        refCode: decoded.args.refCode,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      // Skip duplicates
      const orderFilledKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderFilled = await prisma.event.findFirst({
        where: {
          transactionHash: orderFilledKey.transactionHash,
          blockNumber: orderFilledKey.blockNumber,
          logIndex: orderFilledKey.logIndex,
        },
      });

      if (existingOrderFilled) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderFilled event tx=${orderFilledKey.transactionHash} block=${orderFilledKey.blockNumber} logIndex=${orderFilledKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      try {
        const order = await prisma.limitOrder.findUnique({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
        });

        if (order) {
          await prisma.limitOrder.update({
            where: { id: order.id },
            data: {
              status: 'filled',
              counterparty: eventData.counterparty.toLowerCase(),
              filledAt: Number(block.timestamp),
              filledTxHash: log.transactionHash || '',
            },
          });
        } else {
          console.warn(
            `[PredictionMarketIndexer] OrderFilled but no matching LimitOrder found for orderId=${eventData.orderId}`
          );
        }
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update LimitOrder on fill:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderFilled: orderId=${eventData.orderId}, predictor=${eventData.predictor}, counterparty=${eventData.counterparty}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderFilled:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processOrderCancelled(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: OrderCancelledEvent };

      const eventData = {
        eventType: 'OrderCancelled',
        orderId: decoded.args.orderId.toString(),
        predictor: decoded.args.maker,
        predictorCollateral: decoded.args.makerCollateral.toString(),
        counterpartyCollateral: decoded.args.takerCollateral.toString(),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const orderCancelledKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingOrderCancelled = await prisma.event.findFirst({
        where: {
          transactionHash: orderCancelledKey.transactionHash,
          blockNumber: orderCancelledKey.blockNumber,
          logIndex: orderCancelledKey.logIndex,
        },
      });

      if (existingOrderCancelled) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate OrderCancelled event tx=${orderCancelledKey.transactionHash} block=${orderCancelledKey.blockNumber} logIndex=${orderCancelledKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      try {
        const order = await prisma.limitOrder.findUnique({
          where: {
            chainId_marketAddress_orderId: {
              chainId: this.chainId,
              marketAddress: log.address.toLowerCase(),
              orderId: eventData.orderId,
            },
          },
        });

        if (order) {
          await prisma.limitOrder.update({
            where: { id: order.id },
            data: {
              status: 'cancelled',
              cancelledAt: Number(block.timestamp),
              cancelledTxHash: log.transactionHash || '',
            },
          });
        } else {
          console.warn(
            `[PredictionMarketIndexer] OrderCancelled but no matching LimitOrder found for orderId=${eventData.orderId}`
          );
        }
      } catch (orderError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update LimitOrder on cancel:',
          orderError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed OrderCancelled: orderId=${eventData.orderId}, predictor=${eventData.predictor}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing OrderCancelled:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processMarketResolved(log: Log, block: Block): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: MarketResolvedEvent };

      const eventData = {
        eventType: 'MarketResolved',
        marketId: decoded.args.marketId,
        resolvedToYes: decoded.args.resolvedToYes,
        assertedTruthfully: decoded.args.assertedTruthfully,
        resolutionTime: decoded.args.resolutionTime.toString(),
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const marketResolvedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingMarketResolved = await prisma.event.findFirst({
        where: {
          transactionHash: marketResolvedKey.transactionHash,
          blockNumber: marketResolvedKey.blockNumber,
          logIndex: marketResolvedKey.logIndex,
        },
      });

      if (existingMarketResolved) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate MarketResolved event tx=${marketResolvedKey.transactionHash} block=${marketResolvedKey.blockNumber} logIndex=${marketResolvedKey.logIndex}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      // Update Condition status
      try {
        const condition = await prisma.condition.findUnique({
          where: { id: eventData.marketId },
        });

        if (condition) {
          await prisma.condition.update({
            where: { id: condition.id },
            data: {
              settled: true,
              resolvedToYes: eventData.resolvedToYes,
              settledAt: Number(block.timestamp),
            },
          });
          console.log(
            `[PredictionMarketIndexer] Updated Condition ${eventData.marketId} to settled`
          );
        } else {
          console.warn(
            `[PredictionMarketIndexer] MarketResolved but no matching Condition found for marketId=${eventData.marketId}`
          );
        }
      } catch (conditionError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update Condition on resolve:',
          conditionError
        );
      }

      console.log(
        `[PredictionMarketIndexer] Processed MarketResolved: marketId=${eventData.marketId}, resolvedToYes=${eventData.resolvedToYes}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing MarketResolved:',
        error
      );
      Sentry.captureException(error);
    }
  }

  private async processMarketSubmittedToUMA(
    log: Log,
    block: Block
  ): Promise<void> {
    try {
      const decoded = decodeEventLog({
        abi: PREDICTION_MARKET_ABI,
        data: log.data,
        topics: log.topics,
      }) as { args: MarketSubmittedToUMAEvent };

      const eventData = {
        eventType: 'MarketSubmittedToUMA',
        marketId: decoded.args.marketId,
        assertionId: decoded.args.assertionId,
        asserter: decoded.args.asserter,
        claim: decoded.args.claim,
        resolvedToYes: decoded.args.resolvedToYes,
        blockNumber: Number(log.blockNumber),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        timestamp: Number(block.timestamp),
      };

      const submittedKey = {
        transactionHash: log.transactionHash || '',
        blockNumber: Number(log.blockNumber || 0),
        logIndex: log.logIndex || 0,
      } as const;

      const existingEvent = await prisma.event.findFirst({
        where: {
          transactionHash: submittedKey.transactionHash,
          blockNumber: submittedKey.blockNumber,
          logIndex: submittedKey.logIndex,
        },
      });

      // Always update Condition with assertionId (even if event already exists)
      // This ensures reindexing fills in missing data
      try {
        const condition = await prisma.condition.findUnique({
          where: { id: eventData.marketId },
        });

        if (condition) {
          // Update if assertionId or assertionTimestamp is missing
          if (!condition.assertionId || !condition.assertionTimestamp) {
            await prisma.condition.update({
              where: { id: condition.id },
              data: {
                assertionId: eventData.assertionId,
                assertionTimestamp: Number(block.timestamp),
              },
            });
            console.log(
              `[PredictionMarketIndexer] Updated Condition ${eventData.marketId} with assertionId ${eventData.assertionId} and timestamp ${block.timestamp}`
            );
          }
        } else {
          console.warn(
            `[PredictionMarketIndexer] MarketSubmittedToUMA but no matching Condition found for marketId=${eventData.marketId}`
          );
        }
      } catch (conditionError) {
        console.error(
          '[PredictionMarketIndexer] Failed to update Condition on submission:',
          conditionError
        );
      }

      if (existingEvent) {
        console.log(
          `[PredictionMarketIndexer] Skipping duplicate MarketSubmittedToUMA event tx=${submittedKey.transactionHash}`
        );
        return;
      }

      await prisma.event.create({
        data: {
          blockNumber: Number(log.blockNumber || 0),
          transactionHash: log.transactionHash || '',
          timestamp: BigInt(block.timestamp),
          logIndex: log.logIndex || 0,
          logData: eventData,
        },
      });

      console.log(
        `[PredictionMarketIndexer] Processed MarketSubmittedToUMA: marketId=${eventData.marketId}, assertionId=${eventData.assertionId}`
      );
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error processing MarketSubmittedToUMA:',
        error
      );
      Sentry.captureException(error);
    }
  }

  async watchBlocksForResource(resourceSlug: string): Promise<void> {
    if (this.isWatching) {
      console.log(
        `[PredictionMarketIndexer:${this.chainId}] Already watching events`
      );
      return;
    }

    // Clean up any existing watcher before creating a new one
    if (this.currentUnwatch) {
      try {
        console.log('[PredictionMarketIndexer] Cleaning up existing watcher');
        this.currentUnwatch();
      } catch (error) {
        console.error(
          '[PredictionMarketIndexer] Error cleaning up old watcher:',
          error
        );
      }
      this.currentUnwatch = null;
    }

    // Remove any existing SIGINT listener
    if (this.sigintHandler) {
      console.log(
        '[PredictionMarketIndexer] Removing existing SIGINT listener'
      );
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }

    this.isWatching = true;
    console.log(
      `[PredictionMarketIndexer:${this.chainId}] Starting to watch events for resource: ${resourceSlug} on contract ${this.contractAddress}`
    );

    try {
      const addresses = [this.contractAddress];
      if (this.resolverAddress) {
        addresses.push(this.resolverAddress);
      }

      // Watch for all PredictionMarket events in a single watcher
      this.currentUnwatch = this.client.watchContractEvent({
        address: addresses,
        abi: PREDICTION_MARKET_ABI,
        onLogs: async (logs) => {
          for (const log of logs) {
            try {
              // Get the block for timestamp information
              const block = await this.client.getBlock({
                blockNumber: log.blockNumber,
                includeTransactions: false,
              });

              await this.processLog(log, block);
            } catch (logError) {
              console.error(
                `[PredictionMarketIndexer] Error processing log:`,
                logError
              );
            }
          }
        },
        onError: (error) => {
          console.error(
            '[PredictionMarketIndexer] Error watching events:',
            error
          );
          Sentry.captureException(error);
          this.isWatching = false;

          // Clean up the failed watcher for non-EtherealChain only - Ethereal doesn't rate limit but is flaky
          if (this.currentUnwatch && this.chainId !== 5064014) {
            try {
              console.log(
                '[PredictionMarketIndexer] Cleaning up failed watcher'
              );
              this.currentUnwatch();
            } catch (cleanupError) {
              console.error(
                '[PredictionMarketIndexer] Error cleaning up failed watcher:',
                cleanupError
              );
            }
            this.currentUnwatch = null;
          }

          // Attempt to restart after a delay
          console.log(
            '[PredictionMarketIndexer] Attempting to restart in 10 seconds...'
          );
          setTimeout(() => {
            if (!this.isWatching) {
              console.log(
                '[PredictionMarketIndexer] Restarting event watcher...'
              );
              this.watchBlocksForResource(resourceSlug).catch(
                (restartError: Error) => {
                  console.error(
                    '[PredictionMarketIndexer] Failed to restart:',
                    restartError
                  );
                  Sentry.captureException(restartError);
                }
              );
            }
          }, 10000);
        },
      });

      // Keep the process alive
      this.sigintHandler = () => {
        console.log('[PredictionMarketIndexer] Stopping event watcher...');
        if (this.currentUnwatch) {
          this.currentUnwatch();
          this.currentUnwatch = null;
        }
        this.isWatching = false;
        if (this.sigintHandler) {
          process.removeListener('SIGINT', this.sigintHandler);
          this.sigintHandler = null;
        }
        process.exit(0);
      };
      console.log('[PredictionMarketIndexer] Adding SIGINT listener');
      process.on('SIGINT', this.sigintHandler);

      // Keep the process running
      await new Promise(() => {});
    } catch (error) {
      console.error(
        '[PredictionMarketIndexer] Error starting event watchers:',
        error
      );
      Sentry.captureException(error);
      this.isWatching = false;
    }
  }
}

export default PredictionMarketIndexer;
