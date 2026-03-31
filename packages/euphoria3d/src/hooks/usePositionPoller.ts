import { useEffect, useRef } from 'react';
import type { SubmittedPosition } from '../components/PositionOctants';
import type { EnvMode } from '../lib/envConfig';

const PREDICTIONS_QUERY = /* GraphQL */ `
  query Predictions($address: String!, $take: Int) {
    predictions(address: $address, take: $take) {
      predictionId
      createdAt
      settled
      result
      pickConfig {
        picks {
          conditionId
          predictedOutcome
        }
      }
    }
  }
`;

interface Prediction {
  predictionId: string;
  createdAt: string;
  settled: boolean;
  result: string | null;
  pickConfig: {
    picks: Array<{ conditionId: string; predictedOutcome: number }>;
  } | null;
}

function getApiUrl(envMode: EnvMode): string {
  return envMode === 'staging'
    ? 'https://api.staging.sapience.xyz/graphql'
    : 'https://api.sapience.xyz/graphql';
}

/**
 * Polls the GraphQL indexer for submitted positions:
 * 1. 'accepted' positions — waiting for indexing (sets 'filled' + predictionId)
 * 2. 'filled' positions without won — waiting for settlement (sets won)
 */
export function usePositionPoller(
  positions: SubmittedPosition[],
  updatePosition: (id: string, update: Partial<SubmittedPosition>) => void,
  predictor: string | undefined,
  envMode: EnvMode,
) {
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!predictor) return;

    const apiUrl = getApiUrl(envMode);

    for (const pos of positions) {
      const needsIndexing = pos.status === 'accepted';
      const needsSettlement = pos.status === 'filled' && pos.won === undefined && pos.predictionId;
      if (!needsIndexing && !needsSettlement) continue;
      if (timersRef.current.has(pos.id)) continue; // already polling

      const expectedPicks = pos.auctionMeta?.picks;
      if (!expectedPicks || expectedPicks.length === 0) continue;

      const expectedPickSet = new Set(
        expectedPicks.map((p) => `${p.conditionId}:${p.predictedOutcome}`),
      );

      const poll = async () => {
        try {
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: PREDICTIONS_QUERY,
              variables: { address: predictor, take: 10 },
            }),
          });
          const json = await res.json();
          const predictions: Prediction[] = json?.data?.predictions ?? [];

          const found = predictions.find((p) => {
            const predPicks = p.pickConfig?.picks;
            if (!predPicks || predPicks.length !== expectedPicks.length) return false;
            return predPicks.every((pk) =>
              expectedPickSet.has(`${pk.conditionId}:${pk.predictedOutcome}`),
            );
          });

          if (found) {
            if (needsIndexing) {
              // Phase 1: position indexed
              updatePosition(pos.id, {
                status: 'filled',
                predictionId: found.predictionId,
              });
            }

            if (found.settled && found.result) {
              // Phase 2: settled
              const won = found.result === 'PREDICTOR_WINS';
              updatePosition(pos.id, { won });
              timersRef.current.delete(pos.id);
              return; // done
            }
          }
        } catch (err) {
          console.warn(`[position-poller] fetch failed for ${pos.id}:`, err);
        }

        // Continue polling
        const interval = needsIndexing ? 2000 : 5000;
        timersRef.current.set(pos.id, setTimeout(poll, interval));
      };

      const initialDelay = needsIndexing ? 1000 : 5000;
      timersRef.current.set(pos.id, setTimeout(poll, initialDelay));
    }

    // Clean up timers for positions that no longer need polling
    const activeIds = new Set(positions.map((p) => p.id));
    for (const [id, timer] of timersRef.current) {
      if (!activeIds.has(id)) {
        clearTimeout(timer);
        timersRef.current.delete(id);
        continue;
      }
      const pos = positions.find((p) => p.id === id);
      if (pos && pos.status === 'filled' && pos.won !== undefined) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }
  }, [positions, updatePosition, predictor, envMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);
}
