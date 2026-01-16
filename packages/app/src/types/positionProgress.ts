export enum PositionStage {
  IDLE = 'idle',
  SUBMITTING = 'submitting', // UserOp being sent to bundler
  CONFIRMING = 'confirming', // Waiting for on-chain confirmation
  INDEXING = 'indexing', // After receipt, waiting for GraphQL
  COMPLETE = 'complete', // Position indexed
  ERROR = 'error',
}

export interface PositionBenchmarks {
  submissionStartedAt: number | null;
  txSentAt: number | null;
  receiptReceivedAt: number | null;
  positionIndexedAt: number | null;
}

export interface PositionProgressState {
  stage: PositionStage;
  benchmarks: PositionBenchmarks;
  txHash?: string;
  error?: string;
}
