'use client';

import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@foil/ui/components/ui/dialog';
import { Input } from '@foil/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@foil/ui/components/ui/select';
import { useToast } from '@foil/ui/hooks/use-toast';
import type { MarketType } from '@foil/ui/types';
import { formatDistanceToNow } from 'date-fns';
import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Address } from 'viem';
import { useSignMessage } from 'wagmi';

import { useMarketGroupLatestEpoch } from '~/hooks/contract/useMarketGroupLatestEpoch';
import {
  useEnrichedMarketGroups,
  type EnrichedMarketGroup,
} from '~/hooks/graphql/useMarketGroups';
import { ADMIN_AUTHENTICATE_MSG } from '~/lib/constants';

import AddMarketDialog from './AddMarketDialog';
import CombinedMarketDialog from './CombinedMarketDialog';
import MarketDeployButton from './MarketDeployButton';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import OwnershipDialog from './OwnershipDialog';
import ReindexMarketButton from './ReindexMarketButton';
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
  market: MarketType;
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

const MarketGroupContainer: React.FC<{ group: EnrichedMarketGroup }> = ({
  group,
}) => {
  const { latestEpochId } = useMarketGroupLatestEpoch(
    group.address as Address,
    group.chainId
  );
  const [ownershipDialogOpen, setOwnershipDialogOpen] = useState(false);

  return (
    <div className="border rounded-lg shadow-sm">
      <header className="flex items-center justify-between p-4 border-b bg-secondary rounded-t-lg">
        <div>
          <h2 className="text-lg font-semibold">{group.question}</h2>
          <div className="text-xs mt-1">
            <div>
              {group.chainId}:{group.address}
            </div>
            {group.owner && <div>Owner: {group.owner}</div>}
          </div>
        </div>
        {!group.address && (
          <MarketGroupHeaderDetails
            group={group}
            latestEpochId={latestEpochId}
          />
        )}
        <div className="flex items-center gap-2">
          {group.address ? (
            <>
              <OwnershipDialog
                open={ownershipDialogOpen}
                onOpenChange={setOwnershipDialogOpen}
                marketGroupAddress={group.address as Address}
                currentOwner={group.owner ?? undefined}
              />
              <AddMarketDialog
                marketGroupAddress={group.address as Address}
                chainId={group.chainId}
              />
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/forecasting/${getChainShortName(group.chainId)}:${group.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </a>
              </Button>
              <ReindexMarketButton
                marketGroupAddress={group.address}
                chainId={group.chainId}
              />
            </>
          ) : (
            <>
              <span className="text-sm text-gray-500">
                Chain ID: {group.chainId}
              </span>
              <MarketGroupDeployButton group={group} />
            </>
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

const ReindexFactoryForm = () => {
  const { signMessageAsync } = useSignMessage();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [factoryAddress, setFactoryAddress] = useState(
    '0xA61BF5F56a6a035408d5d76EbE58F8204891FB40'
  );
  const [chainId, setChainId] = useState('8453'); // Default to Base

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (!factoryAddress.startsWith('0x')) {
      toast({
        variant: 'destructive',
        title: 'Invalid address',
        description: 'Factory address must start with 0x',
      });
      return;
    }

    try {
      setIsLoading(true);

      // Generate timestamp and signature
      const timestamp = Date.now(); // Use Date.now() for consistency
      const signature = await signMessageAsync({
        message: ADMIN_AUTHENTICATE_MSG, // Use standard auth message
      });

      // Construct the API URL from environment variable
      const apiUrl = `${process.env.NEXT_PUBLIC_FOIL_API_URL || ''}/reindex/market-group-factory`;

      // Call the API endpoint
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId: Number(chainId),
          factoryAddress,
          signature,
          timestamp, // Send the timestamp used for validation
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reindex factory');
      }

      toast({
        title: 'Reindex started',
        description: 'The market group factory reindexing process has started.',
      });

      // Reset form
      setFactoryAddress('');
    } catch (error) {
      console.error('Reindex factory error:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border rounded-lg shadow-sm p-6">
      <h2 className="text-lg font-semibold mb-4">
        Reindex Market Group Factory
      </h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label htmlFor="factoryAddress" className="text-sm font-medium">
            Factory Address
          </label>
          <Input
            id="factoryAddress"
            placeholder="0x..."
            value={factoryAddress}
            onChange={(e) => setFactoryAddress(e.target.value)}
          />
          {factoryAddress && !factoryAddress.startsWith('0x') && (
            <p className="text-sm text-red-500">Address must start with 0x</p>
          )}
        </div>

        <div className="space-y-2">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label htmlFor="chainSelect" className="text-sm font-medium">
            Chain
          </label>
          <Select value={chainId} onValueChange={setChainId}>
            <SelectTrigger id="chainSelect" className="w-full">
              <SelectValue placeholder="Select chain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Ethereum</SelectItem>
              <SelectItem value="10">Optimism</SelectItem>
              <SelectItem value="8453">Base</SelectItem>
              <SelectItem value="42161">Arbitrum</SelectItem>
              <SelectItem value="137">Polygon</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <LottieLoader width={16} height={16} />
              <span className="ml-2">Processing...</span>
            </>
          ) : (
            'Reindex Factory'
          )}
        </Button>
      </form>
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
    <div className="container pt-24 mx-auto px-6">
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
            <DialogContent className="overflow-hidden">
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

      {/* Add spacing before the reindex form */}
      <div className="mt-12 mb-16">
        <ReindexFactoryForm />
      </div>
    </div>
  );
};

export default Admin;
