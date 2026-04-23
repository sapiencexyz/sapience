import {
  decodeAuctionPredictedOutcomes,
  PYTH_RESOLVER_SET,
} from '~/lib/auction/decodePredictedOutcomes';
import type { UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';

// Shape of auction.started / auction.bids message payload (relayer feed).
export interface AuctionMessageData {
  auctionId?: string;
  predictor?: string;
  predictorCollateral?: string;
  predictorDeadline?: number;
  resolver?: string;
  predictedOutcomes?: string[];
  predictorNonce?: number | string;
  intentSignature?: string;
  picks?: Array<{
    conditionResolver: string;
    conditionId: string;
    predictedOutcome: number;
  }>;
  bids?: Array<Record<string, unknown>>;
  payload?: {
    auctionId?: string;
    resolver?: string;
    predictor?: string;
    predictorCollateral?: string;
    predictedOutcomes?: string[];
  };
  [key: string]: unknown;
}

// Minimal message shape consumed by the terminal page.
type AuctionMessage = {
  type?: string;
  time?: number | string | null;
  channel?: string | null;
  auctionId?: string;
  data?: unknown;
};

// Safely cast an unknown relayer payload to the expected shape.
export function asAuctionData(data: unknown): AuctionMessageData {
  if (data && typeof data === 'object') return data as AuctionMessageData;
  return {} as AuctionMessageData;
}

// Derive a stable auction id from channel / payload / message-level id.
export function getAuctionId(m: AuctionMessage): string | null {
  const d = asAuctionData(m?.data);
  return (
    m?.channel || d?.auctionId || d?.payload?.auctionId || m?.auctionId || null
  );
}

// Collect unique DB condition IDs referenced by auction.started messages.
// Pyth picks are intentionally excluded — they encode market params rather
// than DB condition IDs.
export function collectConditionIdsFromMessages(
  messages: AuctionMessage[]
): string[] {
  const set = new Set<string>();
  try {
    for (const m of messages) {
      if (m.type !== 'auction.started') continue;

      const mData = asAuctionData(m?.data);
      const picks = mData?.picks as
        | Array<{ conditionId?: string; conditionResolver?: string }>
        | undefined;
      if (Array.isArray(picks) && picks.length > 0) {
        for (const p of picks) {
          if (p.conditionId && typeof p.conditionId === 'string') {
            const resolver = p.conditionResolver?.toLowerCase?.() ?? '';
            if (PYTH_RESOLVER_SET.has(resolver)) continue;
            set.add(p.conditionId);
          }
        }
        continue;
      }

      const decoded = decodeAuctionPredictedOutcomes({
        resolver: mData?.resolver ?? mData?.payload?.resolver,
        predictedOutcomes: mData?.predictedOutcomes,
      });
      if (decoded.kind !== 'condition') continue;
      for (const o of decoded.outcomes || []) {
        const id = o?.marketId as string | undefined;
        if (id && typeof id === 'string') set.add(id);
      }
    }
  } catch {
    /* noop */
  }
  return Array.from(set);
}

// Collect unique predictor addresses seen on auction.started messages.
export function collectUniqueAddressesFromMessages(
  messages: AuctionMessage[]
): string[] {
  const set = new Set<string>();
  for (const m of messages) {
    if (m.type !== 'auction.started') continue;
    const auctionData = m.data as AuctionMessageData | undefined;
    const addr = auctionData?.predictor;
    if (addr && typeof addr === 'string') {
      set.add(addr);
    }
  }
  return Array.from(set).sort();
}

export type AuctionMessageAggregates<M> = {
  lastActivityByAuction: Map<string, number>;
  latestStartedByAuction: Map<string, M>;
};

// Produce per-auction last-activity timestamp and latest auction.started message.
// Reused by row pruning, sorting and rendering.
export function buildAuctionMessageAggregates<
  M extends AuctionMessage & { time?: number | string | null },
>(messages: M[]): AuctionMessageAggregates<M> {
  const lastActivity = new Map<string, number>();
  const latestStarted = new Map<string, M>();
  for (const m of messages) {
    const id = getAuctionId(m);
    if (!id) continue;
    const t = Number(m?.time || 0);
    const prev = lastActivity.get(id) || 0;
    if (t > prev) lastActivity.set(id, t);
    if (m.type === 'auction.started') {
      const prevStarted = latestStarted.get(id);
      if (!prevStarted || Number(prevStarted?.time || 0) < t) {
        latestStarted.set(id, m);
      }
    }
  }
  return {
    lastActivityByAuction: lastActivity,
    latestStartedByAuction: latestStarted,
  };
}

// Project a relayer message into the terminal's UI-transaction shape.
// auction.started → predictor's own collateral; auction.bids → top bid (by
// highest counterpartyCollateral).
export function auctionMessageToUiTx(m: {
  time: number;
  type: string;
  data: unknown;
}): UiTransaction {
  const createdAt = new Date(m.time).toISOString();
  const txData = asAuctionData(m.data);
  if (m.type === 'auction.started') {
    const predictor = txData?.predictor || '';
    const predictorCollateral = txData?.predictorCollateral || '0';
    return {
      id: m.time,
      type: 'FORECAST',
      createdAt,
      collateral: String(predictorCollateral || '0'),
      position: { owner: predictor },
    } as UiTransaction;
  }
  if (m.type === 'auction.bids') {
    const bids = Array.isArray(txData?.bids) ? txData.bids : [];
    const top = bids.reduce((best, b) => {
      try {
        const cur = BigInt(String(b?.counterpartyCollateral ?? '0'));
        const bestVal = BigInt(String(best?.counterpartyCollateral ?? '0'));
        return cur > bestVal ? b : best;
      } catch {
        return best;
      }
    }, bids[0] || null);
    const counterparty = top?.counterparty || '';
    const counterpartyCollateral = top?.counterpartyCollateral || '0';
    return {
      id: m.time,
      type: 'FORECAST',
      createdAt,
      collateral: String(counterpartyCollateral || '0'),
      position: { owner: counterparty },
    } as UiTransaction;
  }
  return {
    id: m.time,
    type: 'FORECAST',
    createdAt,
    collateral: '0',
    position: { owner: '' },
  } as UiTransaction;
}
