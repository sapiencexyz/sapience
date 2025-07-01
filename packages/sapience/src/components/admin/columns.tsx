'use client';

import { gql } from '@apollo/client';
import { Badge } from '@sapience/ui/components/ui/badge';
import { Button } from '@sapience/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@sapience/ui/components/ui/dialog';
import type { MarketType } from '@sapience/ui/types';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDistanceToNow } from 'date-fns';
import { print } from 'graphql';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import type { Address } from 'viem';
import { formatEther } from 'viem';

import { useMarketGroupLatestEpoch } from '~/hooks/contract/useMarketGroupLatestEpoch';
import type { EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { shortenAddress, foilApi } from '~/lib/utils/util';

import AddMarketDialog from './AddMarketDialog';
import MarketDeployButton from './MarketDeployButton';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import OwnershipDialog from './OwnershipDialog';
import ReindexMarketButton from './ReindexMarketButton';
import SettleMarketDialog from './SettleMarketDialog';

// GraphQL query for index price at time
const INDEX_PRICE_AT_TIME_QUERY = gql`
  query IndexPriceAtTime(
    $address: String!
    $chainId: Int!
    $marketId: String!
    $timestamp: Int!
  ) {
    indexPriceAtTime(
      address: $address
      chainId: $chainId
      marketId: $marketId
      timestamp: $timestamp
    ) {
      timestamp
      close
    }
  }
`;

// Helper function to convert gwei to ether
const gweiToEther = (value: bigint): string => {
  return formatEther(value * BigInt(1e9));
};

// Hook to get market price data
function useMarketPriceData(
  marketAddress: string,
  chainId: number,
  marketId: number,
  endTimestamp: number
) {
  const now = Math.floor(Date.now() / 1000);
  // Determine if the market is active *before* calculating the timestamp
  const isActive = now < endTimestamp;
  // Use (current time - 60 seconds) if active, otherwise use current time
  const timestampToUse = isActive ? now - 60 : now;
  // Use the lesser of the calculated time (or now-60) and the end time.
  // This ensures settled markets still use endTimestamp.
  // Rename this timestamp as it's used for the API call.
  const timestampForApi = Math.min(timestampToUse, endTimestamp);

  // Calculate a stable timestamp for the queryKey when the market is active.
  // Round down to the nearest 5 minutes (300 seconds) to prevent rapid key changes.
  const queryKeyTimestampInterval = 300;
  const timestampForKey = isActive
    ? Math.floor(timestampForApi / queryKeyTimestampInterval) *
      queryKeyTimestampInterval
    : timestampForApi; // Use the precise timestamp for the key if not active

  const { data, isLoading, error } = useQuery({
    // Use the stabilized timestamp in the query key
    queryKey: [
      'marketPriceData',
      `${chainId}:${marketAddress}`,
      marketId,
      timestampForKey,
    ],
    queryFn: async () => {
      // Use the API timestamp for the enabled check
      if (!marketAddress || !chainId || !marketId || !timestampForApi) {
        return null;
      }

      const response = await foilApi.post('/graphql', {
        query: print(INDEX_PRICE_AT_TIME_QUERY),
        variables: {
          address: marketAddress,
          chainId,
          marketId: marketId.toString(),
          timestamp: timestampForApi,
        },
      });

      const priceData = response.data?.indexPriceAtTime;
      if (!priceData) {
        return null;
      }

      const indexPrice = Number(gweiToEther(BigInt(priceData.close)));

      return {
        timestamp: priceData.timestamp,
        indexPrice,
      };
    },
    // Use the API timestamp for the enabled check
    enabled: !!marketAddress && !!chainId && !!marketId && !!timestampForApi,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    indexPrice: data?.indexPrice,
    timestamp: data?.timestamp,
    isLoading,
    error,
    isActive,
  };
}

const getChainShortName = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return 'eth';
    case 10:
      return 'op';
    case 8453:
      return 'base';
    default:
      return chainId.toString();
  }
};

const MarketItem = ({
  market,
  group,
  latestEpochId,
}: {
  market: MarketType;
  group: EnrichedMarketGroup;
  latestEpochId?: bigint;
}) => {
  const marketId = market.marketId ? Number(market.marketId) : 0;
  const currentEpochId = latestEpochId ? Number(latestEpochId) : 0;
  const shouldShowDeployButton =
    marketId > currentEpochId &&
    !!market.startingSqrtPriceX96 &&
    !!market.marketParams?.claimStatement;

  const isDeployed = !!market.poolAddress;
  const isFutureEndTime = (market.endTimestamp ?? 0) * 1000 > Date.now();

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const renderMarketActions = () => {
    // Case 1: Deployed group but market not yet deployed
    if (group.address && !isDeployed && shouldShowDeployButton) {
      return (
        <MarketDeployButton
          market={market}
          marketGroupAddress={group.address}
          chainId={group.chainId}
        />
      );
    }

    // Case 2: Deployed group, market deployed but waiting
    if (group.address && !isDeployed) {
      return (
        <Button size="sm" disabled variant="outline">
          Waiting
        </Button>
      );
    }

    // Case 3: Deployed group, market deployed, past end time, needs settlement
    if (group.address && isDeployed && !isFutureEndTime) {
      return (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" disabled={market.settled ?? false}>
              {market.settled ? 'Settled' : 'Settle'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{market.question}</DialogTitle>
            </DialogHeader>
            <SettleMarketDialog market={market} marketGroup={group} />
          </DialogContent>
        </Dialog>
      );
    }

    // Case 4: Group not deployed yet
    if (!group.address) {
      return (
        <Button size="sm" disabled>
          Deploy
        </Button>
      );
    }

    // Default case: No action needed
    return null;
  };

  return (
    <div
      key={`${group.address || group.id}-${market.marketId || market.id}`}
      className="flex items-center justify-between py-2 gap-4s"
    >
      <span className="font-medium items-center flex gap-2">
        <small className="text-muted-foreground">
          #{market.marketId || market.id}
        </small>{' '}
        {market.question || 'No question available'}
      </span>
      <div className="flex items-center space-x-4">
        {isDeployed && isFutureEndTime && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            ends {formatTimestamp(market.endTimestamp ?? 0)}
          </span>
        )}
        {renderMarketActions()}
      </div>
    </div>
  );
};

const OwnerCell = ({ group }: { group: EnrichedMarketGroup }) => {
  const [ownershipDialogOpen, setOwnershipDialogOpen] = useState(false);

  if (!group.owner) {
    return <span className="text-muted-foreground">N/A</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span>{shortenAddress(group.owner)}</span>
      {group.address && (
        <>
          <button
            type="button"
            onClick={() => setOwnershipDialogOpen(true)}
            className="p-1 hover:bg-accent rounded-full transition-colors"
          >
            <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
          <OwnershipDialog
            open={ownershipDialogOpen}
            onOpenChange={setOwnershipDialogOpen}
            marketGroupAddress={group.address as Address}
            currentOwner={group.owner ?? undefined}
          />
        </>
      )}
    </div>
  );
};

// Settlement Price Cell Component
const SettlementPriceCell = ({ group }: { group: EnrichedMarketGroup }) => {
  // Find the current/active market or the most recent settled market
  const now = Math.floor(Date.now() / 1000);
  const currentMarket = group.markets.find((m) => {
    const start = m.startTimestamp ?? 0;
    const end = m.endTimestamp ?? 0;
    return start <= now && now <= end;
  });

  const mostRecentSettledMarket = group.markets
    .filter((m) => (m.endTimestamp ?? 0) < now)
    .sort((a, b) => (b.endTimestamp ?? 0) - (a.endTimestamp ?? 0))[0];

  const marketToUse = currentMarket || mostRecentSettledMarket;

  const marketId = Number(marketToUse?.marketId);
  const endTimestamp = marketToUse?.endTimestamp ?? 0;

  const { indexPrice, isLoading, error, isActive } = useMarketPriceData(
    group.address!,
    group.chainId,
    marketId,
    endTimestamp
  );

  if (!group.address) {
    return <span className="text-muted-foreground">N/A</span>;
  }

  if (!marketToUse) {
    return <span className="text-muted-foreground">No markets</span>;
  }

  if (isLoading) {
    return <span className="text-muted-foreground">Loading...</span>;
  }

  if (error) {
    return <span className="text-red-500">Error</span>;
  }

  if (indexPrice === undefined || indexPrice === null) {
    return <span className="text-muted-foreground">N/A</span>;
  }

  return (
    <div className="flex flex-col">
      <span className="font-mono text-sm">{indexPrice.toFixed(4)}</span>
      <span className="text-xs text-muted-foreground">
        {isActive ? 'Current' : 'Settlement'}
      </span>
    </div>
  );
};

const ActionsCell = ({ group }: { group: EnrichedMarketGroup }) => {
  const [marketsDialogOpen, setMarketsDialogOpen] = useState(false);
  const { latestEpochId } = useMarketGroupLatestEpoch(
    group.address as Address,
    group.chainId
  );

  if (group.address) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Dialog open={marketsDialogOpen} onOpenChange={setMarketsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
              <DialogTitle>Markets for {group.question}</DialogTitle>
              <div className="flex items-center gap-2 pt-2">
                <AddMarketDialog
                  marketGroupAddress={group.address as Address}
                  chainId={group.chainId}
                />
                <ReindexMarketButton
                  marketGroupAddress={group.address}
                  chainId={group.chainId}
                />
              </div>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {group.markets.length > 0 ? (
                group.markets
                  .sort((a, b) => {
                    const aId = a.marketId ? Number(a.marketId) : Number(a.id);
                    const bId = b.marketId ? Number(b.marketId) : Number(b.id);
                    return aId - bId;
                  })
                  .map((market) => (
                    <MarketItem
                      key={`${group.address || group.id}-${market.marketId || market.id}`}
                      market={market}
                      group={group}
                      latestEpochId={latestEpochId}
                    />
                  ))
              ) : (
                <p className="text-sm text-gray-500 px-4 py-2">
                  No markets in this group.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/forecasting/${getChainShortName(group.chainId)}:${group.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <MarketGroupDeployButton group={group} />
    </div>
  );
};

// Renders status badges for a market group
const StatusBadges = ({ group }: { group: EnrichedMarketGroup }) => {
  const nowSeconds = Date.now() / 1000;

  const needsSettlement = group.markets.some((m) => {
    const isDeployed = !!m.poolAddress;
    const isPastEnd = (m.endTimestamp ?? 0) < nowSeconds;
    const notSettled = !(m.settled ?? false);
    return isDeployed && isPastEnd && notSettled;
  });

  const activeMarket = group.markets.some((m) => {
    const start = m.startTimestamp ?? 0;
    const end = m.endTimestamp ?? 0;
    return start < nowSeconds && end > nowSeconds;
  });

  const upcomingMarket = group.markets.some((m) => {
    const start = m.startTimestamp ?? 0;
    return start > nowSeconds;
  });

  const needsDeployment =
    !group.address || group.markets.some((m) => !m.poolAddress);

  const allSettled =
    group.markets.length > 0 &&
    !needsSettlement &&
    !activeMarket &&
    !upcomingMarket;

  const badges: React.ReactNode[] = [];

  if (needsSettlement) {
    badges.push(
      <Badge
        key="needsSettlement"
        variant="destructive"
        className="whitespace-nowrap"
      >
        Needs Settlement
      </Badge>
    );
  }

  if (activeMarket) {
    badges.push(
      <Badge key="active" className="whitespace-nowrap">
        Active Market
      </Badge>
    );
  }

  if (upcomingMarket) {
    badges.push(
      <Badge key="upcoming" variant="secondary" className="whitespace-nowrap">
        Upcoming Markets
      </Badge>
    );
  }

  if (needsDeployment) {
    badges.push(
      <Badge
        key="needsDeploy"
        variant="destructive"
        className="whitespace-nowrap"
      >
        Needs Deployment
      </Badge>
    );
  }

  if (allSettled) {
    badges.push(
      <Badge key="settled" variant="outline" className="whitespace-nowrap">
        Settled
      </Badge>
    );
  }

  if (badges.length === 0) return null;

  return <div className="flex flex-col items-start gap-1">{badges}</div>;
};

const columns: ColumnDef<EnrichedMarketGroup>[] = [
  {
    id: 'badges',
    header: () => null,
    cell: ({ row }) => <StatusBadges group={row.original} />,
  },
  {
    accessorKey: 'question',
    header: 'Question',
    cell: ({ row }) => {
      const group = row.original;
      return (
        <div className="font-medium flex items-center gap-2">
          {group.category && (
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: group.category.color }}
              title={group.category.name}
            />
          )}
          <span>{group.question}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'address',
    header: 'Address',
    cell: ({ row }) => {
      const group = row.original;
      if (!group.address) {
        return (
          <span className="text-muted-foreground">
            Chain ID: {group.chainId}
          </span>
        );
      }
      return (
        <div>
          {getChainShortName(group.chainId)}:{shortenAddress(group.address)}
        </div>
      );
    },
  },
  {
    id: 'settlementPrice',
    header: 'Settlement Price',
    cell: ({ row }) => <SettlementPriceCell group={row.original} />,
  },
  {
    accessorKey: 'owner',
    header: 'Owner',
    cell: ({ row }) => <OwnerCell group={row.original} />,
  },
  {
    id: 'actions',
    cell: ({ row }) => <ActionsCell group={row.original} />,
    header: () => <div className="text-right" />,
  },
];

export default columns;
