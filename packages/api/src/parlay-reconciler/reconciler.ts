import 'tsconfig-paths/register';
import prisma from '../db';
import {
  PARLAY_RECONCILE_CONFIG,
  PARLAY_RECONCILE_IPC_KEYS,
  setReconcilerStatus,
} from './config';
import { getStringParam, setStringParam } from '../candle-cache/dbUtils';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
import PredictionMarketIndexer from '../workers/indexers/predictionMarketIndexer';
import { PREDICTION_MARKET_CONTRACT_ADDRESS } from '../workers/indexers/predictionMarketIndexer';
import type { Block } from 'viem';

export class ParlayReconciler {
  private static instance: ParlayReconciler;
  private isRunning: boolean = false;

  public static getInstance(): ParlayReconciler {
    if (!this.instance) this.instance = new ParlayReconciler();
    return this.instance;
  }

  private async getWatermark(chainId: number): Promise<bigint | null> {
    if (!PARLAY_RECONCILE_CONFIG.enableWatermark) return null;
    const key = PARLAY_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
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
    if (!PARLAY_RECONCILE_CONFIG.enableWatermark) return;
    const key = PARLAY_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
    await setStringParam(key, toBlock.toString());
  }

  public async runOnce(lookbackSeconds?: number): Promise<void> {
    if (this.isRunning) {
      return; // skip overlapping runs
    }
    this.isRunning = true;
    try {
      await setReconcilerStatus('processing', 'Reconciling parlay events');

      const lookbackSecondsEffective =
        lookbackSeconds ?? PARLAY_RECONCILE_CONFIG.defaultLookbackSeconds;

      const chainsRaw = await prisma.parlay.findMany({
        select: { chainId: true },
        distinct: ['chainId'],
      });
      const chainIds = Array.from(new Set(chainsRaw.map((r) => r.chainId)));

      let totalScanned = 0;
      const totalInserted = 0;
      let totalUpdated = 0;
      let totalParlays = 0;

      for (const chainId of chainIds) {
        const client = getProviderForChain(chainId);

        const toBlock = 'latest' as const;

        const watermark = await this.getWatermark(chainId);
        let fromBlock: bigint | null = null;
        if (watermark) {
          fromBlock = watermark + 1n;
        }
        if (fromBlock === null) {
          const latestBlockNumber = await client.getBlockNumber();
          const offset = BigInt(PARLAY_RECONCILE_CONFIG.fallbackBlockLookback);
          fromBlock =
            latestBlockNumber > offset ? latestBlockNumber - offset : 0n;
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
              `${PARLAY_RECONCILE_CONFIG.logPrefix} getBlockByTimestamp failed; keeping fallback window (chain=${chainId}, reason=${(err as Error).message})`
            );
          }
        }

        const parlayCount = await prisma.parlay.count({
          where: { chainId },
        });
        totalParlays += parlayCount;

        if (parlayCount === 0) continue;

        try {
          // Use efficient single getLogs call like MarketEventReconciler
          const logs = await client.getLogs({
            address: PREDICTION_MARKET_CONTRACT_ADDRESS as `0x${string}`,
            fromBlock,
            toBlock,
          });

          totalScanned += logs.length;

          if (logs.length > 0) {
            const indexer = new PredictionMarketIndexer(chainId);

            // Cache blocks to avoid repeated RPC calls (like MarketEventReconciler)
            const blockCache = new Map<bigint, Block>();

            for (const log of logs) {
              try {
                const logBlockNumber = log.blockNumber || 0n;

                // Get block from cache or fetch once
                let block = blockCache.get(logBlockNumber);
                if (!block) {
                  block = await client.getBlock({
                    blockNumber: logBlockNumber,
                  });
                  blockCache.set(logBlockNumber, block);
                }

                // Process the log using existing indexer logic
                // @ts-expect-error - accessing private method for reconciliation
                await indexer.processLog(log, block);
                totalUpdated += 1;
              } catch (logError) {
                console.error(
                  `${PARLAY_RECONCILE_CONFIG.logPrefix} Error processing log:`,
                  logError
                );
              }
            }
          }
          const newWatermark =
            logs.length > 0 && logs[logs.length - 1].blockNumber
              ? logs[logs.length - 1].blockNumber!
              : toBlock === 'latest'
                ? await client.getBlockNumber()
                : BigInt(toBlock);
          await this.setWatermark(chainId, newWatermark);
        } catch (e) {
          console.error(
            `${PARLAY_RECONCILE_CONFIG.logPrefix} Failed processing batch for chain=${chainId}:`,
            e
          );
        }
      }

      console.log(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} Run complete: chains=${chainIds.length}, parlays=${totalParlays}, scannedLogs=${totalScanned}, newEvents=${totalInserted}, updated=${totalUpdated}`
      );
      await setStringParam(
        PARLAY_RECONCILE_IPC_KEYS.lastRunAt,
        new Date().toISOString()
      );
      await setReconcilerStatus('idle', 'Parlay reconciliation completed');
    } finally {
      this.isRunning = false;
    }
  }
}
