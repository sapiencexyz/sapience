export const PRECOMPUTE_CONFIG = {
  logPrefix: '[PRECOMPUTE]',
  batchSize: 1000,
  batchLogInterval: 10_000,
};

export const PRECOMPUTE_IPC_KEYS = {
  precomputeRunnerStatus: 'precomputeRunnerStatus',
  pnlLastProcessedCollateralTransferId: 'pnl_lastProcessedCollateralTransferId',
  accuracyLastProcessedSettlementEventId:
    'accuracy_lastProcessedSettlementEventId',
};
