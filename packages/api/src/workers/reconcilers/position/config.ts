import { getStringParam, setStringParam } from '../reconcilerUtils';

export const POSITION_RECONCILE_CONFIG = {
  defaultLookbackSeconds: Number(
    process.env.POSITION_RECONCILE_LOOKBACK_SECONDS || '60'
  ),
  enableWatermark:
    (
      process.env.POSITION_RECONCILE_ENABLE_WATERMARK || 'true'
    ).toLowerCase() === 'true',
  logPrefix: '[POSITION_RECONCILER]',
  fallbackBlockLookback: Number(
    process.env.POSITION_RECONCILE_FALLBACK_BLOCKS || '5000'
  ),
  batchSize: Number(process.env.POSITION_RECONCILE_BATCH_SIZE || '100'),
};

export const POSITION_RECONCILE_IPC_KEYS = {
  reconcilerStatus: 'positionReconcile:status',
  lastRunAt: 'positionReconcile:lastRunAt',
  chainWatermarkKey: (chainId: number) =>
    `positionReconcile:chain:${chainId}:lastToBlock`,
};

export async function getReconcilerStatus(): Promise<{
  status: 'processing' | 'idle';
  description?: string;
  timestamp?: number;
} | null> {
  const raw = await getStringParam(
    POSITION_RECONCILE_IPC_KEYS.reconcilerStatus
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
  await setStringParam(POSITION_RECONCILE_IPC_KEYS.reconcilerStatus, payload);
}
