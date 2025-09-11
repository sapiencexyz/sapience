import { getStringParam, setStringParam } from 'src/candle-cache/dbUtils';

export const MARKET_EVENT_RECONCILE_CONFIG = {
  defaultLookbackSeconds: Number(
    process.env.MARKET_EVENT_RECONCILE_LOOKBACK_SECONDS || '60'
  ),
  enableWatermark:
    (
      process.env.MARKET_EVENT_RECONCILE_ENABLE_WATERMARK || 'true'
    ).toLowerCase() === 'true',
  logPrefix: '[RECONCILER]',
  fallbackBlockLookback: Number(
    process.env.MARKET_EVENT_RECONCILE_FALLBACK_BLOCKS || '5000'
  ),
};

export const MARKET_EVENT_RECONCILE_IPC_KEYS = {
  reconcilerStatus: 'marketEventReconcile:status',
  lastRunAt: 'marketEventReconcile:lastRunAt',
  chainWatermarkKey: (chainId: number) =>
    `marketEventReconcile:chain:${chainId}:lastToBlock`,
};

export async function getReconcilerStatus(): Promise<{
  status: 'processing' | 'idle';
  description?: string;
  timestamp?: number;
} | null> {
  const raw = await getStringParam(
    MARKET_EVENT_RECONCILE_IPC_KEYS.reconcilerStatus
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setReconcilerStatus(
  status: 'processing' | 'idle',
  description: string
) {
  const payload = JSON.stringify({
    status,
    description,
    timestamp: Date.now(),
  });
  await setStringParam(
    MARKET_EVENT_RECONCILE_IPC_KEYS.reconcilerStatus,
    payload
  );
}
