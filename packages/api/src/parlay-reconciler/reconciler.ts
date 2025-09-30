import 'tsconfig-paths/register';
import prisma from '../db';
import {
  PARLAY_RECONCILE_CONFIG,
  PARLAY_RECONCILE_IPC_KEYS,
  setReconcilerStatus,
} from './config';
import { getStringParam, setStringParam } from '../candle-cache/dbUtils';
import { getProviderForChain, getBlockByTimestamp } from '../utils/utils';
import { processParlayEventsForBlockRange } from 'src/parlay-reconciler/processor';
import Sentry from '../instrument';


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
      await setReconcilerStatus(
        'processing',
        'Reconciling parlay events'
      );

      const lookbackSecondsEffective =
        lookbackSeconds ?? PARLAY_RECONCILE_CONFIG.defaultLookbackSeconds;

      // Gather unique chains that have parlays
      const chainsRaw = await prisma.parlay.findMany({
        select: { chainId: true },
        distinct: ['chainId'],
      });
      const chainIds = Array.from(new Set(chainsRaw.map((r) => r.chainId)));

      let totalScanned = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalParlays = 0;

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
            PARLAY_RECONCILE_CONFIG.fallbackBlockLookback
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
              `${PARLAY_RECONCILE_CONFIG.logPrefix} getBlockByTimestamp failed; keeping fallback window (chain=${chainId}, reason=${(err as Error).message})`
            );
          }
        }

        // Count parlays for this chain for metrics
        const parlayCount = await prisma.parlay.count({
          where: { chainId },
        });
        totalParlays += parlayCount;

        if (parlayCount === 0) continue;

        try {
          const { scanned, inserted, updated, maxBlockSeen } =
            await processParlayEventsForBlockRange(
              chainId,
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
            `${PARLAY_RECONCILE_CONFIG.logPrefix} Failed processing batch for chain=${chainId}:`,
            e
          );
          // Do not advance watermark on failure; next run will retry the same range
        }
      }

      // Also update endsAt field for existing parlays
      await this.reconcileEndsAtField();

      console.log(
        `${PARLAY_RECONCILE_CONFIG.logPrefix} Run complete: chains=${chainIds.length}, parlays=${totalParlays}, scannedLogs=${totalScanned}, newParlays=${totalInserted}, updated=${totalUpdated}`
      );
      await setStringParam(
        PARLAY_RECONCILE_IPC_KEYS.lastRunAt,
        new Date().toISOString()
      );
      await setReconcilerStatus(
        'idle',
        'Parlay reconciliation completed'
      );
    } finally {
      this.isRunning = false;
    }
  }


  private async reconcileEndsAtField(): Promise<void> {
    console.log(`${PARLAY_RECONCILE_CONFIG.logPrefix} Reconciling endsAt field`);

    // Find parlays with null endsAt that have predictedOutcomes
    const parlaysWithoutEndsAt = await prisma.parlay.findMany({
      where: {
        endsAt: null,
        status: 'active', // Only update active parlays
      },
      take: PARLAY_RECONCILE_CONFIG.batchSize,
    });

    let endsAtUpdated = 0;
    for (const parlay of parlaysWithoutEndsAt) {
      try {
        const outcomes = parlay.predictedOutcomes as unknown as {
          conditionId: string;
          prediction: boolean;
        }[];

        if (!outcomes || !Array.isArray(outcomes) || outcomes.length === 0) {
          continue;
        }

        const conditionIds = outcomes.map((o) => o.conditionId);
        const conditions = await prisma.condition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, endTime: true },
        });

        if (conditions.length > 0) {
          const endsAt = conditions.reduce(
            (max, c) => (c.endTime > max ? c.endTime : max),
            conditions[0].endTime
          );

          await prisma.parlay.update({
            where: { id: parlay.id },
            data: { endsAt },
          });

          endsAtUpdated++;
        }
      } catch (error) {
        console.error(
          `${PARLAY_RECONCILE_CONFIG.logPrefix} Error updating endsAt for parlay ${parlay.id}:`,
          error
        );
      }
    }

    console.log(
      `${PARLAY_RECONCILE_CONFIG.logPrefix} EndsAt reconciliation: processed ${parlaysWithoutEndsAt.length} parlays, updated ${endsAtUpdated}`
    );
  }
}
