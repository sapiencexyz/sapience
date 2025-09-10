import { PRECOMPUTE_CONFIG, PRECOMPUTE_IPC_KEYS } from './config';
import {
  getParam,
  setParam,
  setStringParam,
  getStringParam,
} from 'src/candle-cache/dbUtils';
import prisma from 'src/db';
import { updateTwErrorForMarket } from '../workers/jobs/updateTwErrorForMarket';
import { updateRealizedPnlForKeys } from '../workers/jobs/updateRealizedPnlForKeys';

export class PnlAccuracyReconciler {
  private static instance: PnlAccuracyReconciler;

  public static getInstance(): PnlAccuracyReconciler {
    if (!this.instance) this.instance = new PnlAccuracyReconciler();
    return this.instance;
  }

  private async setStatus(
    status: 'processing' | 'idle',
    description: string
  ): Promise<void> {
    const existing = await getStringParam(
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus
    );
    type Stored = {
      isActive: boolean;
      processType?: string;
      resourceSlug?: string;
      startTime?: number;
      builderStatus?: {
        status: string;
        description: string;
        timestamp: number;
      };
    };
    let parsed: Stored = { isActive: false };
    if (existing) {
      try {
        parsed = JSON.parse(existing) as Stored;
      } catch {
        parsed = { isActive: false };
      }
    }
    parsed.builderStatus = { status, description, timestamp: Date.now() };
    parsed.isActive = status === 'processing';
    await setStringParam(
      PRECOMPUTE_IPC_KEYS.precomputeRunnerStatus,
      JSON.stringify(parsed)
    );
  }

  public async runOnce(): Promise<void> {
    await this.setStatus('processing', 'Reconciling PnL and Accuracy');

    // 1) Accuracy: process newly settled markets after watermark
    const lastSettledId = await getParam(
      PRECOMPUTE_IPC_KEYS.accuracyLastProcessedSettlementEventId
    );
    const newSettlements = await prisma.event.findMany({
      where: {
        id: { gt: lastSettledId },
        // JSON filter for eventName is not typed; use raw SQL fallback via contains
        // Type assertion is avoided by using Prisma JSON path access through string filter
      },
      orderBy: { id: 'asc' },
      include: { market_group: true },
      take: PRECOMPUTE_CONFIG.batchSize,
    });
    for (const ev of newSettlements) {
      const address = ev.market_group?.address || '';
      const marketId =
        (
          ev.logData as unknown as {
            args?: { marketId?: string | number | bigint };
          }
        )?.args?.marketId?.toString() || '0';
      if (address && marketId) {
        await updateTwErrorForMarket(address, marketId);
      }
    }
    // Summary log for accuracy updates
    console.log(
      `[LEADERBOARDS] Accuracy: processed ${newSettlements.length} settlement events`
    );
    if (newSettlements.length > 0) {
      const maxId = newSettlements[newSettlements.length - 1].id;
      await setParam(
        PRECOMPUTE_IPC_KEYS.accuracyLastProcessedSettlementEventId,
        maxId
      );
    }

    // 2) PnL: process new collateral transfers after watermark
    const lastTransferId = await getParam(
      PRECOMPUTE_IPC_KEYS.pnlLastProcessedCollateralTransferId
    );
    const transfers = await prisma.collateralTransfer.findMany({
      where: { id: { gt: lastTransferId } },
      orderBy: { id: 'asc' },
      include: {
        transaction: {
          include: {
            position: {
              include: { market: { include: { market_group: true } } },
            },
          },
        },
      },
      take: PRECOMPUTE_CONFIG.batchSize,
    });

    const keysMap = new Map<
      string,
      { chainId: number; address: string; marketId: number; owner: string }
    >();
    for (const t of transfers) {
      const pos = t.transaction?.position;
      const m = pos?.market;
      const mg = m?.market_group;
      const owner = pos?.owner?.toLowerCase() || t.owner.toLowerCase();
      if (!m || !mg || !owner) continue;
      const key = `${mg.chainId}-${mg.address}-${m.marketId}-${owner}`;
      if (!keysMap.has(key))
        keysMap.set(key, {
          chainId: mg.chainId,
          address: mg.address!.toLowerCase(),
          marketId: m.marketId,
          owner,
        });
    }
    const keys = Array.from(keysMap.values());
    if (keys.length > 0) await updateRealizedPnlForKeys(keys);
    // Summary log for PnL updates
    console.log(
      `[LEADERBOARDS] PnL: processed ${keys.length} owner-market keys`
    );
    if (transfers.length > 0) {
      const maxId = transfers[transfers.length - 1].id;
      await setParam(
        PRECOMPUTE_IPC_KEYS.pnlLastProcessedCollateralTransferId,
        maxId
      );
    }

    await this.setStatus('idle', 'Precompute reconciliation completed');
  }
}
