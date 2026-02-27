import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { ToastAction } from '@sapience/ui/components/ui/toast';
import { useTerminalLogs } from '~/components/terminal/TerminalLogsContext';
import { useRouter } from 'next/navigation';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

const RECENT_PREDICTIONS_QUERY = /* GraphQL */ `
  query RecentCounterpartyPredictions(
    $address: String!
    $take: Int
    $skip: Int
    $orderBy: PredictionSortField
    $orderDirection: SortOrder
  ) {
    predictions(
      address: $address
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
      predictionId
      chainId
      predictor
      counterparty
      marketAddress
      createTxHash
      createdAt
    }
  }
`;

type Prediction = {
  id: number;
  predictionId: string;
  chainId: number;
  predictor: string;
  counterparty: string;
  marketAddress: string;
  createTxHash: string;
  createdAt: string;
};

type PredictionsQueryResponse = {
  predictions: Prediction[];
};

export function useTradeSettledNotifications() {
  const { address } = useAccount();
  const { pushLogEntry } = useTerminalLogs();
  const { toast } = useToast();
  const router = useRouter();

  // Track the latest createdAt timestamp we've processed
  const latestCreatedAtRef = useRef<number>(Math.floor(Date.now() / 1000));

  const { data: predictions } = useQuery({
    queryKey: ['recentCounterpartyPredictions', address],
    queryFn: async () => {
      if (!address) return [];
      const result = await graphqlRequest<PredictionsQueryResponse>(
        RECENT_PREDICTIONS_QUERY,
        {
          address: address.toLowerCase(),
          take: 10,
          skip: 0,
          orderBy: 'CREATED_AT',
          orderDirection: 'desc',
        }
      );
      return result.predictions;
    },
    enabled: !!address,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  useEffect(() => {
    if (!predictions || !address) return;

    const addressLower = address.toLowerCase();
    let maxCreatedAt = latestCreatedAtRef.current;

    for (const pred of predictions) {
      const createdAtTs = Math.floor(new Date(pred.createdAt).getTime() / 1000);

      // Skip if prediction is older than or equal to when we last processed
      if (createdAtTs <= latestCreatedAtRef.current) continue;

      // Ensure user is counterparty (not predictor)
      if (pred.counterparty?.toLowerCase() !== addressLower) continue;
      if (pred.predictor.toLowerCase() === addressLower) continue;

      // Track the newest prediction we've seen
      if (createdAtTs > maxCreatedAt) {
        maxCreatedAt = createdAtTs;
      }

      // Format predictor address for display
      const truncatedPredictor = `${pred.predictor.slice(0, 6)}...${pred.predictor.slice(-4)}`;
      const shareUrl = `/predictions/${pred.predictionId}`;

      // Push log entry
      pushLogEntry({
        kind: 'match',
        severity: 'success',
        message: `Trade #${pred.id} was completed with ${truncatedPredictor}`,
        meta: {
          positionId: pred.id,
          predictor: pred.predictor,
        },
      });

      // Show toast
      toast({
        title: 'Trade Complete',
        description: (
          <div className="flex flex-col gap-4">
            <span>
              Prediction #{pred.id} was completed with {truncatedPredictor}
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

    // Update the timestamp cutoff after processing
    latestCreatedAtRef.current = maxCreatedAt;
  }, [predictions, address, pushLogEntry, toast, router]);
}
