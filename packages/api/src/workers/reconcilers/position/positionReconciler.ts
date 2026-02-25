import 'tsconfig-paths/register';
import prisma from '../../../db';
import {
  POSITION_RECONCILE_CONFIG,
  POSITION_RECONCILE_IPC_KEYS,
  setReconcilerStatus,
} from './config';
import { getStringParam, setStringParam } from '../reconcilerUtils';
import { getProviderForChain, getBlockByTimestamp } from '../../../utils/utils';
import PredictionMarketIndexer from '../../../workers/indexers/predictionMarketIndexer';
import { predictionMarket, lzPMResolver, lzUmaResolver } from '@sapience/sdk';
import { predictionMarketLZConditionalTokensResolver, collateralToken } from '@sapience/sdk/contracts';
import type { Block } from 'viem';
import { parseAbiItem, decodeEventLog } from 'viem';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);
const TRANSFER_EVENT_SIG =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class PositionReconciler {
  private static instance: PositionReconciler;
  private isRunning: boolean = false;

  public static getInstance(): PositionReconciler {
    if (!this.instance) this.instance = new PositionReconciler();
    return this.instance;
  }

  private async getWatermark(chainId: number): Promise<bigint | null> {
    if (!POSITION_RECONCILE_CONFIG.enableWatermark) return null;
    const key = POSITION_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
    const raw = await getStringParam(key);
    if (!raw) return null;
    try {
      const n = BigInt(raw);
      return n > 0n ? n : null;
    } catch {
      return null;
    }
  }

  private async setWatermark(chainId: number, toBlock: bigint): Promise<void> {
    if (!POSITION_RECONCILE_CONFIG.enableWatermark) return;
    const key = POSITION_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
    await setStringParam(key, toBlock.toString());
  }

  public async runOnce(lookbackSeconds?: number): Promise<void> {
    if (this.isRunning) {
      return; // skip overlapping runs
    }
    this.isRunning = true;
    try {
      await setReconcilerStatus('processing', 'Reconciling position events');

      const lookbackSecondsEffective =
        lookbackSeconds ?? POSITION_RECONCILE_CONFIG.defaultLookbackSeconds;

      const chainsRaw = await prisma.position.findMany({
        select: { chainId: true },
        distinct: ['chainId'],
      });
      const chainIds = Array.from(new Set(chainsRaw.map((r) => r.chainId)));

      let totalScanned = 0;
      let totalUpdated = 0;
      let totalPositions = 0;

      for (const chainId of chainIds) {
        const client = getProviderForChain(chainId);

        const toBlock = await client.getBlockNumber();

        const watermark = await this.getWatermark(chainId);
        console.log(
          `${POSITION_RECONCILE_CONFIG.logPrefix} Chain ${chainId}: watermark=${watermark ?? 'none'}, toBlock=${toBlock}`
        );
        let fromBlock: bigint | null = null;
        if (watermark) {
          fromBlock = watermark + 1n;
        }
        if (fromBlock === null) {
          const offset = BigInt(
            POSITION_RECONCILE_CONFIG.fallbackBlockLookback
          );
          fromBlock = toBlock > offset ? toBlock - offset : 0n;
        }
        if (fromBlock > toBlock) {
          console.log(
            `${POSITION_RECONCILE_CONFIG.logPrefix} Chain ${chainId}: fromBlock=${fromBlock} > toBlock=${toBlock}, chain has not advanced past watermark — skipping`
          );
          continue;
        }
        if (!watermark && lookbackSecondsEffective > 0) {
          try {
            const ts = Math.floor(Date.now() / 1000) - lookbackSecondsEffective;
            const startBlock = await getBlockByTimestamp(client, ts);
            if (startBlock.number && startBlock.number > fromBlock) {
              fromBlock = startBlock.number;
            }
          } catch (err) {
            console.warn(
              `${POSITION_RECONCILE_CONFIG.logPrefix} getBlockByTimestamp failed; keeping fallback window (chain=${chainId}, reason=${(err as Error).message})`
            );
          }
        }

        const positionCount = await prisma.position.count({
          where: { chainId },
        });
        totalPositions += positionCount;

        if (positionCount === 0) continue;

        const contractEntry = predictionMarket[chainId];
        if (!contractEntry?.address) {
          console.warn(
            `${POSITION_RECONCILE_CONFIG.logPrefix} No PredictionMarket contract found for chain ${chainId}, skipping`
          );
          continue;
        }

        const pmResolverEntry =
          lzPMResolver[chainId as keyof typeof lzPMResolver];
        const umaResolverEntry =
          lzUmaResolver[chainId as keyof typeof lzUmaResolver];
        const resolverAddress =
          pmResolverEntry?.address || umaResolverEntry?.address;

        const lzConditionalTokenResolverEntry =
          predictionMarketLZConditionalTokensResolver[
            chainId as keyof typeof predictionMarketLZConditionalTokensResolver
          ];

        const addresses: `0x${string}`[] = [
          contractEntry.address as `0x${string}`,
        ];
        if (resolverAddress) {
          addresses.push(resolverAddress as `0x${string}`);
        }
        if (lzConditionalTokenResolverEntry?.address) {
          addresses.push(
            lzConditionalTokenResolverEntry.address as `0x${string}`
          );
        }

        const collateralEntry = collateralToken[chainId];
        const collateralAddress = collateralEntry?.address?.toLowerCase();
        if (collateralAddress) {
          addresses.push(collateralEntry.address as `0x${string}`);
        }

        try {
          console.log(
            `${POSITION_RECONCILE_CONFIG.logPrefix} Chain ${chainId}: scanning blocks ${fromBlock} to ${toBlock} (range=${toBlock - fromBlock})`
          );
          const logs = await client.getLogs({
            address: addresses,
            fromBlock,
            toBlock,
          });

          totalScanned += logs.length;

          if (logs.length > 0) {
            const indexer = new PredictionMarketIndexer(chainId);
            const blockCache = new Map<bigint, Block>();

            // Split logs: collateral Transfer events vs prediction market events
            const collateralLogs: typeof logs = [];
            const predictionLogs: typeof logs = [];

            for (const log of logs) {
              if (
                collateralAddress &&
                log.address.toLowerCase() === collateralAddress &&
                log.topics[0] === TRANSFER_EVENT_SIG
              ) {
                collateralLogs.push(log);
              } else {
                predictionLogs.push(log);
              }
            }

            // Process prediction market logs through existing indexer
            for (const log of predictionLogs) {
              try {
                const logBlockNumber = log.blockNumber || 0n;

                let block = blockCache.get(logBlockNumber);
                if (!block) {
                  block = await client.getBlock({
                    blockNumber: logBlockNumber,
                  });
                  blockCache.set(logBlockNumber, block);
                }

                // @ts-expect-error - accessing private method for reconciliation
                await indexer.processLog(log, block);
                totalUpdated += 1;
              } catch (logError) {
                console.error(
                  `${POSITION_RECONCILE_CONFIG.logPrefix} Error processing log:`,
                  logError
                );
              }
            }

            // Process collateral Transfer logs into CollateralTransfer table
            for (const log of collateralLogs) {
              try {
                const decoded = decodeEventLog({
                  abi: [TRANSFER_EVENT],
                  data: log.data,
                  topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
                });
                const { from, to, value } = decoded.args as {
                  from: `0x${string}`;
                  to: `0x${string}`;
                  value: bigint;
                };

                await prisma.collateralTransfer.upsert({
                  where: {
                    chainId_transactionHash_logIndex: {
                      chainId,
                      transactionHash: log.transactionHash!,
                      logIndex: Number(log.logIndex ?? 0),
                    },
                  },
                  create: {
                    chainId,
                    blockNumber: Number(log.blockNumber ?? 0),
                    transactionHash: log.transactionHash!,
                    logIndex: Number(log.logIndex ?? 0),
                    from: from.toLowerCase(),
                    to: to.toLowerCase(),
                    value: value.toString(),
                  },
                  update: {},
                });
                totalUpdated += 1;
              } catch (logError) {
                console.error(
                  `${POSITION_RECONCILE_CONFIG.logPrefix} Error processing collateral transfer log:`,
                  logError
                );
              }
            }

            if (collateralLogs.length > 0) {
              console.log(
                `${POSITION_RECONCILE_CONFIG.logPrefix} Chain ${chainId}: reconciled ${collateralLogs.length} collateral transfers`
              );
            }
          }
          await this.setWatermark(chainId, toBlock);
          console.log(
            `${POSITION_RECONCILE_CONFIG.logPrefix} Chain ${chainId}: watermark updated to ${toBlock}`
          );
        } catch (e) {
          console.error(
            `${POSITION_RECONCILE_CONFIG.logPrefix} Failed processing batch for chain=${chainId}:`,
            e
          );
        }
      }

      console.log(
        `${POSITION_RECONCILE_CONFIG.logPrefix} Run complete: chains=${chainIds.length}, positions=${totalPositions}, scannedLogs=${totalScanned}, updated=${totalUpdated}`
      );
      await setStringParam(
        POSITION_RECONCILE_IPC_KEYS.lastRunAt,
        new Date().toISOString()
      );
      await setReconcilerStatus('idle', 'Position reconciliation completed');
    } finally {
      this.isRunning = false;
    }
  }
}
