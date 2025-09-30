import { getStringParam, setStringParam } from '../candle-cache/dbUtils';

export const PARLAY_RECONCILE_CONFIG = {
  defaultLookbackSeconds: Number(
    process.env.PARLAY_RECONCILE_LOOKBACK_SECONDS || '60'
  ),
  enableWatermark:
    (process.env.PARLAY_RECONCILE_ENABLE_WATERMARK || 'true').toLowerCase() ===
    'true',
  logPrefix: '[PARLAY_RECONCILER]',
  fallbackBlockLookback: Number(
    process.env.PARLAY_RECONCILE_FALLBACK_BLOCKS || '5000'
  ),
  batchSize: Number(process.env.PARLAY_RECONCILE_BATCH_SIZE || '100'),
};

export const PARLAY_RECONCILE_IPC_KEYS = {
  reconcilerStatus: 'parlayReconcile:status',
  lastRunAt: 'parlayReconcile:lastRunAt',
  chainWatermarkKey: (chainId: number) =>
    `parlayReconcile:chain:${chainId}:lastToBlock`,
};

export async function getReconcilerStatus(): Promise<{
  status: 'processing' | 'idle';
  description?: string;
  timestamp?: number;
} | null> {
  const raw = await getStringParam(PARLAY_RECONCILE_IPC_KEYS.reconcilerStatus);
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
  await setStringParam(PARLAY_RECONCILE_IPC_KEYS.reconcilerStatus, payload);
}
