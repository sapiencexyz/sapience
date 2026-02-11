import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { ToastAction } from '@sapience/ui/components/ui/toast';
import { useTerminalLogs } from '~/components/terminal/TerminalLogsContext';
import { useRouter } from 'next/navigation';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

const RECENT_POSITIONS_QUERY = /* GraphQL */ `
  query RecentCounterpartyPositions(
    $address: String!
    $take: Int
    $skip: Int
    $orderBy: String
    $orderDirection: String
  ) {
    positions(
      address: $address
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
      chainId
      mintedAt
      predictor
      counterparty
      marketAddress
      counterpartyNftTokenId
    }
  }
`;

type Position = {
  id: number;
  chainId: number;
  mintedAt: number;
  predictor: string;
  counterparty: string;
  marketAddress: string;
  counterpartyNftTokenId: string;
};

type PositionsQueryResponse = {
  positions: Position[];
};

export function useTradeSettledNotifications() {
  const { address } = useAccount();
  const { pushLogEntry } = useTerminalLogs();
  const { toast } = useToast();
  const router = useRouter();

  // Track the latest mintedAt timestamp we've processed
  const latestMintedAtRef = useRef<number>(Math.floor(Date.now() / 1000));

  const { data: positions } = useQuery({
    queryKey: ['recentCounterpartyPositions', address],
    queryFn: async () => {
      if (!address) return [];
      const result = await graphqlRequest<PositionsQueryResponse>(
        RECENT_POSITIONS_QUERY,
        {
          address: address.toLowerCase(),
          take: 10,
          skip: 0,
          orderBy: 'mintedAt',
          orderDirection: 'desc',
        }
      );
      return result.positions;
    },
    enabled: !!address,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  useEffect(() => {
    if (!positions || !address) return;

    const addressLower = address.toLowerCase();
    let maxMintedAt = latestMintedAtRef.current;

    for (const pos of positions) {
      // Skip if position is older than or equal to when we last processed
      if (pos.mintedAt <= latestMintedAtRef.current) continue;

      // Ensure user is counterparty (not predictor)
      if (pos.counterparty.toLowerCase() !== addressLower) continue;
      if (pos.predictor.toLowerCase() === addressLower) continue;

      // Track the newest position we've seen
      if (pos.mintedAt > maxMintedAt) {
        maxMintedAt = pos.mintedAt;
      }

      // Format predictor address for display
      const truncatedPredictor = `${pos.predictor.slice(0, 6)}...${pos.predictor.slice(-4)}`;
      const shareUrl = `/positions/${pos.marketAddress}/${pos.counterpartyNftTokenId}`;

      // Push log entry
      pushLogEntry({
        kind: 'match',
        severity: 'success',
        message: `Trade #${pos.id} was completed with ${truncatedPredictor}`,
        meta: {
          positionId: pos.id,
          predictor: pos.predictor,
        },
      });

      // Show toast
      toast({
        title: 'Trade Complete',
        description: (
          <div className="flex flex-col gap-4">
            <span>
              Position #{pos.id} was completed with {truncatedPredictor}
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
    latestMintedAtRef.current = maxMintedAt;
  }, [positions, address, pushLogEntry, toast, router]);
}
