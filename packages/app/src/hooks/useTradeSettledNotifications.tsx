import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { ToastAction } from '@sapience/ui/components/ui/toast';
import { useRouter } from 'next/navigation';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import { useTerminalLogs } from '~/components/terminal/TerminalLogsContext';

// v2: participant filter collapses v1's address arg; orderBy is explicit.
// v2 drops the numeric row id — notifications key on `predictionId`.
const RECENT_PREDICTIONS_QUERY = `
  query RecentCounterpartyPredictions($participant: Address!, $first: Int) {
    predictions(
      filter: { participant: $participant }
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        predictionId
        chainId
        predictor
        counterparty
        createTxHash
        createdAt
      }
    }
  }
`;

type PredictionNode = {
  predictionId: string;
  chainId: number;
  predictor: string;
  counterparty: string;
  createTxHash: string;
  createdAt: string;
};

type PredictionsQueryResponse = {
  predictions: { nodes: PredictionNode[] } | null;
};

export function useTradeSettledNotifications() {
  const { address } = useAccount();
  const { pushLogEntry } = useTerminalLogs();
  const { toast } = useToast();
  const router = useRouter();

  // Only notify for predictions created after mount…
  const mountTsRef = useRef<number>(Math.floor(Date.now() / 1000));
  // …and never twice for the same prediction. Keyed on predictionId — the
  // v1 moving created-at cutoff silently dropped same-second predictions.
  const notifiedRef = useRef<Set<string>>(new Set());

  const { data: predictions } = useQuery({
    queryKey: ['recentCounterpartyPredictions', address],
    queryFn: async () => {
      if (!address) return [];
      const result = await graphqlRequest<PredictionsQueryResponse>(
        RECENT_PREDICTIONS_QUERY,
        {
          participant: address.toLowerCase(),
          first: 10,
        }
      );
      return result?.predictions?.nodes ?? [];
    },
    enabled: !!address,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  useEffect(() => {
    if (!predictions || !address) return;

    const addressLower = address.toLowerCase();

    for (const pred of predictions) {
      const createdAtTs = Math.floor(new Date(pred.createdAt).getTime() / 1000);

      // Skip predictions that predate this session
      if (createdAtTs <= mountTsRef.current) continue;

      // Skip already-notified predictions
      if (notifiedRef.current.has(pred.predictionId)) continue;

      // Ensure user is counterparty (not predictor)
      if (pred.counterparty?.toLowerCase() !== addressLower) continue;
      if (pred.predictor.toLowerCase() === addressLower) continue;

      notifiedRef.current.add(pred.predictionId);

      // Format addresses/ids for display
      const truncatedPredictor = `${pred.predictor.slice(0, 6)}...${pred.predictor.slice(-4)}`;
      const shortPredictionId = pred.predictionId.slice(0, 10);
      const shareUrl = `/predictions/${pred.predictionId}`;

      // Push log entry
      pushLogEntry({
        kind: 'match',
        severity: 'success',
        message: `Trade #${shortPredictionId} was completed with ${truncatedPredictor}`,
        meta: {
          positionId: pred.predictionId,
          predictor: pred.predictor,
        },
      });

      // Show toast
      toast({
        title: 'Trade Complete',
        description: (
          <div className="flex flex-col gap-4">
            <span>
              Prediction #{shortPredictionId} was completed with{' '}
              {truncatedPredictor}
            </span>
            <ToastAction
              altText="View position"
              onClick={() => router.push(shareUrl)}
              className="w-fit"
            >
              View
            </ToastAction>
          </div>
        ),
        duration: 5000,
      });
    }
  }, [predictions, address, pushLogEntry, toast, router]);
}
