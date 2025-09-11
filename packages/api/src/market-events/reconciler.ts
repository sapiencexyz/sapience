import 'tsconfig-paths/register';
import prisma from 'src/db';
import {
  MARKET_EVENT_RECONCILE_CONFIG,
  MARKET_EVENT_RECONCILE_IPC_KEYS,
  setReconcilerStatus,
} from './config';
import { getStringParam, setStringParam } from 'src/candle-cache/dbUtils';
import { getProviderForChain, getBlockByTimestamp } from 'src/utils/utils';
import { processMarketGroupLogsForAddressesRange } from 'src/controllers/market';

export class MarketEventReconciler {
  private static instance: MarketEventReconciler;
  private isRunning: boolean = false;

  public static getInstance(): MarketEventReconciler {
    if (!this.instance) this.instance = new MarketEventReconciler();
    return this.instance;
  }

  private async getWatermark(chainId: number): Promise<bigint | null> {
    if (!MARKET_EVENT_RECONCILE_CONFIG.enableWatermark) return null;
    const key = MARKET_EVENT_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
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
    if (!MARKET_EVENT_RECONCILE_CONFIG.enableWatermark) return;
    const key = MARKET_EVENT_RECONCILE_IPC_KEYS.chainWatermarkKey(chainId);
    await setStringParam(key, toBlock.toString());
  }

  public async runOnce(lookbackSeconds?: number): Promise<void> {
    if (this.isRunning) {
      return; // skip overlapping runs
    }
    this.isRunning = true;
    try {
      await setReconcilerStatus(
        'processing',
        'Reconciling recent market events'
      );

      const lookbackSecondsEffective =
        lookbackSeconds ?? MARKET_EVENT_RECONCILE_CONFIG.defaultLookbackSeconds;

      // Gather unique chains that have market groups
      const chainsRaw = await prisma.marketGroup.findMany({
        select: { chainId: true },
        distinct: ['chainId'],
      });
      const chainIds = Array.from(new Set(chainsRaw.map((r) => r.chainId)));

      let totalScanned = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalGroups = 0;

      for (const chainId of chainIds) {
        const client = getProviderForChain(chainId);

        // Determine end block: use 'latest' to avoid extra RPC
        const toBlock = 'latest' as const;

        // Determine start block, preferring watermark. Avoid timestamp binary search unless needed.
        const watermark = await this.getWatermark(chainId);
        let fromBlock: bigint | null = null;
        if (watermark) {
          fromBlock = watermark + 1n;
        }
        if (fromBlock === null) {
          // If no watermark yet, use a conservative block offset fallback to avoid binary search
          const latestBlockNumber = await client.getBlockNumber();
          const offset = BigInt(
            MARKET_EVENT_RECONCILE_CONFIG.fallbackBlockLookback
          );
          fromBlock =
            latestBlockNumber > offset ? latestBlockNumber - offset : 0n;
        }
        // If caller specified a custom lookbackSeconds, optionally try timestamp search once
        // but only if it would reduce the range compared to the fallback.
        if (!watermark && lookbackSecondsEffective > 0) {
          try {
            const ts = Math.floor(Date.now() / 1000) - lookbackSecondsEffective;
            const startBlock = await getBlockByTimestamp(client, ts);
            if (startBlock.number && startBlock.number > fromBlock) {
              fromBlock = startBlock.number;
            }
          } catch (err) {
            console.warn(
              `${MARKET_EVENT_RECONCILE_CONFIG.logPrefix} getBlockByTimestamp failed; keeping fallback window (chain=${chainId}, reason=${(err as Error).message})`
            );
          }
        }

        // With toBlock='latest', fromBlock is always <= toBlock logically

        const marketGroups = await prisma.marketGroup.findMany({
          where: { chainId, address: { not: null } },
          select: { id: true, address: true, chainId: true },
        });
        totalGroups += marketGroups.length;
        if (marketGroups.length === 0) continue;

        try {
          const { scanned, inserted, updated, maxBlockSeen } =
            await processMarketGroupLogsForAddressesRange(
              marketGroups.map((mg) => ({
                id: mg.id,
                address: (mg.address || '').toLowerCase(),
                chainId,
              })),
              client,
              fromBlock,
              toBlock
            );
          totalScanned += scanned;
          totalInserted += inserted;
          totalUpdated += updated;
          // Advance watermark only on successful processing for this chain.
          const newWatermark =
            maxBlockSeen && maxBlockSeen > 0n
              ? maxBlockSeen
              : fromBlock > 0n
                ? fromBlock - 1n
                : 0n;
          await this.setWatermark(chainId, newWatermark);
        } catch (e) {
          console.error(
            `${MARKET_EVENT_RECONCILE_CONFIG.logPrefix} Failed processing batch for chain=${chainId}:`,
            e
          );
          // Do not advance watermark on failure; next run will retry the same range
        }
      }

      console.log(
        `${MARKET_EVENT_RECONCILE_CONFIG.logPrefix} Run complete: chains=${chainIds.length}, groups=${totalGroups}, scannedLogs=${totalScanned}, newEvents=${totalInserted}, updated=${totalUpdated}`
      );
      await setStringParam(
        MARKET_EVENT_RECONCILE_IPC_KEYS.lastRunAt,
        new Date().toISOString()
      );
      await setReconcilerStatus(
        'idle',
        'Market events reconciliation completed'
      );
    } finally {
      this.isRunning = false;
    }
  }
}
