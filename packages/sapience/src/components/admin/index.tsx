'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Address } from 'viem';

import { useMarketGroupLatestEpoch } from '~/hooks/contract/useMarketGroupLatestEpoch';
import {
  useEnrichedMarketGroups,
  type EnrichedMarketGroup,
  type Market,
} from '~/hooks/graphql/useMarketGroups';

import CombinedMarketDialog from './CombinedMarketDialog';
import MarketDeployButton from './MarketDeployButton';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import SettleMarketDialog from './SettleMarketDialog';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

const MarketGroupHeaderDetails: React.FC<{
  group: EnrichedMarketGroup;
  latestEpochId?: bigint;
}> = ({ group, latestEpochId }) => {
  return (
    <div className="text-right text-sm text-gray-500">
      {group.address && <div>Address: {group.address}</div>}
      {group.address && (
        <div>
          Latest Epoch:{' '}
          {latestEpochId !== undefined ? latestEpochId.toString() : 'N/A'}
        </div>
      )}
    </div>
  );
};

const getChainShortName = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return 'eth';
    case 10:
      return 'op';
    case 8453:
      return 'base';
    case 42161:
      return 'arb';
    case 137:
      return 'poly';
    default:
      return chainId.toString();
  }
};

const MarketItem: React.FC<{
  market: Market;
  group: EnrichedMarketGroup;
  latestEpochId?: bigint;
}> = ({ market, group, latestEpochId }) => {
  const marketId = market.marketId ? Number(market.marketId) : 0;
  const currentEpochId = latestEpochId ? Number(latestEpochId) : 0;
  const shouldShowDeployButton =
    marketId > currentEpochId &&
    !!market.startingSqrtPriceX96 &&
    !!market.marketParams?.claimStatement;

  const isDeployed = !!market.poolAddress;
  const isFutureEndTime = market.endTimestamp * 1000 > Date.now();

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
          market={{
            id: market.id,
            marketId: market.marketId || 0,
            startTimestamp: market.startTimestamp,
            endTimestamp: market.endTimestamp,
            startingSqrtPriceX96: market.startingSqrtPriceX96 || '',
            baseAssetMinPriceTick: market.baseAssetMinPriceTick || 0,
            baseAssetMaxPriceTick: market.baseAssetMaxPriceTick || 0,
            poolAddress: market.poolAddress ?? null,
            claimStatement: market.marketParams?.claimStatement || '',
          }}
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
            <Button size="sm" disabled={market.settled}>
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
            ends {formatTimestamp(market.endTimestamp)}
          </span>
        )}
        {renderMarketActions()}
      </div>
    </div>
  );
};

const MarketGroupContainer: React.FC<{ group: EnrichedMarketGroup }> = ({
  group,
}) => {
  const { latestEpochId } = useMarketGroupLatestEpoch(
    group.address as Address,
    group.chainId
  );

  return (
    <div className="border rounded-lg shadow-sm">
      <header className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <h2 className="text-lg font-semibold">
          {group.question ||
            (group.address
              ? `Group: ${group.address}`
              : `Group: Draft ID ${group.id}`)}
        </h2>
        {!group.address && (
          <MarketGroupHeaderDetails
            group={group}
            latestEpochId={latestEpochId}
          />
        )}
        <div className="flex items-center gap-4">
          {!group.address && (
            <span className="text-sm text-gray-500">
              Chain ID: {group.chainId}
            </span>
          )}
          {group.address ? (
            <Button variant="secondary" size="sm" asChild>
              <a
                href={`/forecasting/${getChainShortName(group.chainId)}:${group.address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View
              </a>
            </Button>
          ) : (
            <MarketGroupDeployButton group={group} />
          )}
        </div>
      </header>
      <div className="p-4 space-y-3">
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
    </div>
  );
};

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sort market groups with most recent (highest ID) first
  const sortedMarketGroups = marketGroups
    ? [...marketGroups].sort((a, b) => {
        // Sort by id descending (most recent first)
        return Number(b.id) - Number(a.id);
      })
    : [];

  return (
    <div className="container pt-16 lg:pt-24 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                New Market Group
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Launch New Market Group with Markets</DialogTitle>
              </DialogHeader>
              <CombinedMarketDialog onClose={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div>
        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <LottieLoader width={32} height={32} />
          </div>
        )}
        {error && (
          <p className="text-red-500">Error loading markets: {error.message}</p>
        )}
        {sortedMarketGroups && sortedMarketGroups.length > 0 ? (
          <div className="space-y-8">
            {sortedMarketGroups.map((group) => (
              <MarketGroupContainer
                key={group.address || group.id}
                group={group}
              />
            ))}
          </div>
        ) : (
          !isLoading && <p>No active market groups found.</p>
        )}
      </div>
    </div>
  );
};

export default Admin;
