import { decodeAbiParameters } from 'viem';
import type {
  ConditionSelection,
  Order,
  OrderDraft,
  AutoBidLogEntry,
  AutoBidLogSeverity,
} from './types';
import { DEFAULT_CONDITION_ODDS, HOUR_IN_MS } from './constants';

const sanitizeConditionSelections = (
  value: unknown
): ConditionSelection[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const selections = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id =
        typeof (item as ConditionSelection).id === 'string'
          ? (item as ConditionSelection).id
          : null;
      const outcome =
        (item as ConditionSelection).outcome === 'yes' ||
        (item as ConditionSelection).outcome === 'no'
          ? (item as ConditionSelection).outcome
          : null;
      if (!id || !outcome) {
        return null;
      }
      return { id, outcome };
    })
    .filter((entry): entry is ConditionSelection => Boolean(entry));
  return selections.length > 0 ? selections : undefined;
};

export const clampConditionOdds = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_CONDITION_ODDS;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

export const sanitizeOrder = (value: unknown): Order | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<Order>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }
  if (typeof candidate.odds !== 'number' || !Number.isFinite(candidate.odds)) {
    return null;
  }
  const strategy =
    candidate.strategy === 'copy_trade'
      ? 'copy_trade'
      : candidate.strategy === 'conditions'
        ? 'conditions'
        : null;
  if (!strategy) {
    return null;
  }

  const expiration =
    typeof candidate.expiration === 'string' ? candidate.expiration : null;
  const autoPausedAt =
    typeof candidate.autoPausedAt === 'string' ? candidate.autoPausedAt : null;

  const baseOrder: Order = {
    id: candidate.id,
    expiration,
    autoPausedAt,
    strategy,
    odds: clampConditionOdds(candidate.odds),
    status:
      candidate.status === 'paused' || candidate.status === 'active'
        ? candidate.status
        : 'active',
  };

  if (strategy === 'copy_trade') {
    baseOrder.copyTradeAddress =
      typeof candidate.copyTradeAddress === 'string'
        ? candidate.copyTradeAddress
        : undefined;
    baseOrder.increment =
      typeof candidate.increment === 'number' &&
      Number.isFinite(candidate.increment)
        ? candidate.increment
        : undefined;
  } else if (strategy === 'conditions') {
    baseOrder.conditionSelections = sanitizeConditionSelections(
      candidate.conditionSelections
    );
  }

  return baseOrder;
};

export const sanitizeLogEntry = (value: unknown): AutoBidLogEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<AutoBidLogEntry>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }
  if (
    candidate.kind !== 'order' &&
    candidate.kind !== 'match' &&
    candidate.kind !== 'system'
  ) {
    return null;
  }
  const createdAt =
    typeof candidate.createdAt === 'string' ? candidate.createdAt : null;
  if (!createdAt) {
    return null;
  }
  const severity: AutoBidLogSeverity =
    candidate.severity === 'success' ||
    candidate.severity === 'warning' ||
    candidate.severity === 'error' ||
    candidate.severity === 'info'
      ? candidate.severity
      : 'info';
  return {
    id: candidate.id,
    createdAt,
    kind: candidate.kind,
    message:
      typeof candidate.message === 'string' ? candidate.message : '— log —',
    severity,
    meta:
      candidate.meta && typeof candidate.meta === 'object'
        ? candidate.meta
        : null,
  };
};

const normalizeHexId = (value?: string | null) => {
  if (typeof value !== 'string') return null;
  return value.toLowerCase();
};

export const normalizeAddress = (value?: string | null) => {
  if (typeof value !== 'string') return null;
  return value.toLowerCase();
};

export const decodePredictedOutcomes = (
  payload: unknown
): Array<{ marketId: string; prediction: boolean }> => {
  try {
    const arr = Array.isArray(payload)
      ? (payload as `0x${string}`[])
      : typeof payload === 'string'
        ? ([payload] as `0x${string}`[])
        : [];
    if (arr.length === 0) return [];
    const encoded = arr[0];
    if (!encoded) return [];
    const decodedUnknown = decodeAbiParameters(
      [
        {
          type: 'tuple[]',
          components: [
            { name: 'marketId', type: 'bytes32' },
            { name: 'prediction', type: 'bool' },
          ],
        },
      ] as const,
      encoded
    ) as unknown;
    const decodedArr = Array.isArray(decodedUnknown)
      ? ((decodedUnknown as any)[0] as Array<{
          marketId: `0x${string}`;
          prediction: boolean;
        }>)
      : [];
    return (decodedArr || []).map((entry) => ({
      marketId: String(entry.marketId).toLowerCase(),
      prediction: Boolean(entry.prediction),
    }));
  } catch {
    return [];
  }
};

export const formatLogDisplayTime = (value: string) => {
  try {
    const date = new Date(value);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone,
    }).format(date);
  } catch {
    return value;
  }
};

export const getConditionMatchInfo = (
  order: Order,
  predictedLegs: Array<{ marketId: string; prediction: boolean }>
): { inverted: boolean } | null => {
  if (!order.conditionSelections || order.conditionSelections.length === 0) {
    return null;
  }
  const legsMap = new Map<string, boolean>();
  for (const leg of predictedLegs) {
    const id = normalizeHexId(leg.marketId);
    if (id) legsMap.set(id, !!leg.prediction);
  }
  if (legsMap.size === 0) {
    return null;
  }

  const normalizedSelections = order.conditionSelections.map((selection) => ({
    ...selection,
    id: normalizeHexId(selection.id),
  }));

  // SINGLE-CONDITION: Always match if market exists in auction.
  // Direction (direct vs inverted) determined by comparing sides.
  // - Direct (inverted: false): requester prediction opposite of bidder's desired outcome
  // - Inverted (inverted: true): requester prediction same as bidder's desired outcome
  // Both are mathematically valid bets at the stated odds (or 1-odds for inverted).
  if (normalizedSelections.length === 1) {
    const selection = normalizedSelections[0];
    if (!selection.id || !legsMap.has(selection.id)) {
      return null;
    }
    const wantsYes = selection.outcome === 'yes';
    const requesterPrediction = legsMap.get(selection.id)!;
    return { inverted: requesterPrediction === wantsYes };
  }

  // MULTI-CONDITION: Only direct match allowed.
  // All order conditions must exist in auction with opposite predictions.
  // Inverted matching is not supported for multi-condition orders because
  // the odds semantics don't cleanly invert for compound predictions.
  const directMatch = normalizedSelections.every((selection) => {
    if (!selection.id || !legsMap.has(selection.id)) return false;
    const wantsYes = selection.outcome === 'yes';
    const requesterPrediction = legsMap.get(selection.id);
    return requesterPrediction !== wantsYes;
  });

  return directMatch ? { inverted: false } : null;
};

export const describeConditionTargeting = (
  selections?: ConditionSelection[]
) => {
  if (!selections || selections.length === 0) return 'All questions';
  const yesCount = selections.filter(
    (selection) => selection.outcome === 'yes'
  ).length;
  const noCount = selections.length - yesCount;
  if (noCount === 0) {
    return `${yesCount} predicting Yes`;
  }
  if (yesCount === 0) {
    return `${noCount} predicting No`;
  }
  return `${yesCount} Yes · ${noCount} No`;
};

export const withAlpha = (color: string, alpha: number): string => {
  const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
  if (hexMatch.test(color)) {
    const a = Math.max(0, Math.min(1, alpha));
    const aHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, '0');
    return `${color}${aHex}`;
  }
  const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
    `${fn}(${inside} / ${alpha})`;
  if (color.startsWith('hsl(')) return toSlashAlpha('hsl', color.slice(4, -1));
  if (color.startsWith('rgb(')) return toSlashAlpha('rgb', color.slice(4, -1));
  return color;
};

const formatDurationValue = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const fixed = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

export const formatTimeRemaining = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0s';
  const totalSeconds = Math.floor(value / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    if (minutes > 0) {
      return seconds > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : `${hours}h ${minutes}m`;
    }
    return seconds > 0 ? `${hours}h ${seconds}s` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
};

export const deriveDurationValueFromExpiration = (
  expiration?: string | null
): string => {
  if (!expiration) {
    return '';
  }
  const expiresAt = new Date(expiration).getTime();
  if (!Number.isFinite(expiresAt)) {
    return '';
  }
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return '';
  }
  const value = remainingMs / HOUR_IN_MS;
  return formatDurationValue(value);
};

export const createEmptyDraft = (): OrderDraft => ({
  durationValue: '',
  strategy: 'conditions',
  copyTradeAddress: '',
  increment: '1',
  conditionSelections: [],
  odds: DEFAULT_CONDITION_ODDS,
});

export const formatOrderLabelSnapshot = (tag: string) => {
  return tag;
};

export const getStrategyBadgeLabel = (
  order: Order,
  index?: number
): { numberLabel: string; strategyLabel: string } => {
  const numberLabel = `#${(index ?? 0) + 1}`;
  const strategyLabel = order.strategy === 'copy_trade' ? 'COPY' : 'LIMIT';
  return { numberLabel, strategyLabel };
};

export const formatOrderTag = (
  order: Order,
  position: number | null | undefined,
  resolver: (order: Order) => number
) => {
  const index = position != null && position >= 0 ? position : resolver(order);
  return `#${index + 1}`;
};

export const resolveMessageField = (
  data: unknown,
  field: 'bids' | 'predictedOutcomes'
) => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  if (field in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[field];
  }
  const payload = (data as { payload?: unknown }).payload;
  if (payload && typeof payload === 'object' && field in payload) {
    return (payload as Record<string, unknown>)[field];
  }
  return undefined;
};
