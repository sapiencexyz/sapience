import { useCallback, useState } from 'react';
import {
  PositionStage,
  type PositionBenchmarks,
  type PositionProgressState,
} from '~/types/positionProgress';

const initialBenchmarks: PositionBenchmarks = {
  submissionStartedAt: null,
  txSentAt: null,
  receiptReceivedAt: null,
  positionIndexedAt: null,
};

const initialState: PositionProgressState = {
  stage: PositionStage.IDLE,
  benchmarks: initialBenchmarks,
};

function logBenchmarks(benchmarks: PositionBenchmarks): void {
  const {
    submissionStartedAt,
    txSentAt,
    receiptReceivedAt,
    positionIndexedAt,
  } = benchmarks;

  if (!submissionStartedAt || !positionIndexedAt) return;

  const totalMs = positionIndexedAt - submissionStartedAt;
  const submissionToTxMs = txSentAt ? txSentAt - submissionStartedAt : null;
  const txToReceiptMs =
    receiptReceivedAt && txSentAt ? receiptReceivedAt - txSentAt : null;
  const receiptToIndexMs = receiptReceivedAt
    ? positionIndexedAt - receiptReceivedAt
    : null;

  console.log('[PositionProgress] BENCHMARKS:', {
    totalMs,
    submissionToTxMs,
    txToReceiptMs,
    receiptToIndexMs,
  });
}

export function usePositionProgress() {
  const [state, setState] = useState<PositionProgressState>(initialState);

  const startSubmission = useCallback(() => {
    setState({
      stage: PositionStage.SUBMITTING,
      benchmarks: {
        ...initialBenchmarks,
        submissionStartedAt: Date.now(),
      },
    });
  }, []);

  const markTxSent = useCallback((txHash: string) => {
    setState((prev) => ({
      ...prev,
      stage: PositionStage.CONFIRMING,
      txHash,
      benchmarks: {
        ...prev.benchmarks,
        txSentAt: Date.now(),
      },
    }));
  }, []);

  const markReceiptReceived = useCallback((txHash?: string) => {
    setState((prev) => ({
      ...prev,
      stage: PositionStage.INDEXING,
      txHash: txHash ?? prev.txHash,
      benchmarks: {
        ...prev.benchmarks,
        receiptReceivedAt: Date.now(),
      },
    }));
  }, []);

  const markPositionIndexed = useCallback(() => {
    setState((prev) => {
      const benchmarks: PositionBenchmarks = {
        ...prev.benchmarks,
        positionIndexedAt: Date.now(),
      };

      logBenchmarks(benchmarks);

      return {
        ...prev,
        stage: PositionStage.COMPLETE,
        benchmarks,
      };
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      stage: PositionStage.ERROR,
      error,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    progressState: state,
    startSubmission,
    markTxSent,
    markReceiptReceived,
    markPositionIndexed,
    setError,
    reset,
  };
}
