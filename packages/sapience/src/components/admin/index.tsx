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
import { Loader2 } from 'lucide-react';
import type { Address } from 'viem';

import { useEnrichedMarketGroups, type EnrichedMarketGroup } from '~/hooks/graphql/useMarketGroups';
import { useMarketGroupLatestEpoch } from '~/hooks/wagmi/useMarketGroupLatestEpoch';

import CreateMarketDialog from './CreateMarketDialog';
import CreateMarketGroupDialog from './CreateMarketGroupDialog';
import SettleMarketDialog from './SettleMarketDialog';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import MarketDeployButton from './MarketDeployButton';

const MarketGroupHeaderDetails: React.FC<{ group: EnrichedMarketGroup; latestEpochId?: bigint }> = ({ group, latestEpochId }) => {
  return (
    <div className="text-right text-sm text-gray-500">
      <div>Chain ID: {group.chainId}</div>
      <div>Address: {group.address}</div>
      {group.address && (
         <div>
           Latest Epoch: {latestEpochId !== undefined ? latestEpochId.toString() : 'N/A'}
         </div>
      )}
    </div>
  );
};

const MarketGroupContainer: React.FC<{ group: EnrichedMarketGroup }> = ({ group }) => {
  const { 
    latestEpochId, 
    isLoading: isLoadingEpoch, 
    error: epochError 
  } = useMarketGroupLatestEpoch(
    group.address as Address,
    group.chainId
  );

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

  return (
    <div key={group.address || group.id} className="border rounded-lg shadow-sm">
      <header className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <h2 className="text-lg font-semibold">
          {group.question || `Group: ${group.address || `Draft ID ${group.id}`}`}
        </h2>
        <MarketGroupHeaderDetails group={group} latestEpochId={latestEpochId} />
        {group.address ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                Add Market
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Add New Market to Group</DialogTitle>
              </DialogHeader>
              <CreateMarketDialog chainId={group.chainId} marketGroupAddress={group.address} />
            </DialogContent>
          </Dialog>
        ) : (
          <MarketGroupDeployButton group={group} />
        )}
      </header>
      <div className="p-4 space-y-3">
        {group.markets.length > 0 ? (
          group.markets
            .sort((a, b) => b.endTimestamp - a.endTimestamp)
            .map((market) => {
              const isFuture =
                market.endTimestamp * 1000 > Date.now();
              let buttonText = 'Settle';
              let buttonDisabled = false;

              if (market.settled) {
                buttonText = 'Settled';
                buttonDisabled = true;
              } else if (isFuture) {
                buttonText = 'In Progress';
                buttonDisabled = true;
              }

              const marketId = market.marketId ? Number(market.marketId) : 0;
              const currentEpochId = latestEpochId ? Number(latestEpochId) : 0;
              const shouldShowDeployButton = marketId > currentEpochId && 
                !!market.startingSqrtPriceX96 && 
                !!market.claimStatement;

              return (
                <div
                  key={`${group.address || group.id}-${market.marketId || market.id}`}
                  className="flex items-center justify-between py-2"
                >
                  <span className="font-medium">
                    ID: {market.marketId || market.id} - {market.question || 'No question available'}
                  </span>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500">
                      ends {formatTimestamp(market.endTimestamp)}
                    </span>
                    {group.address && (
                      shouldShowDeployButton ? (
                        <MarketDeployButton
                          market={{
                            id: market.id,
                            marketId: market.marketId || 0,
                            startTimestamp: market.startTimestamp,
                            endTimestamp: market.endTimestamp,
                            startingSqrtPriceX96: market.startingSqrtPriceX96 || '',
                            baseAssetMinPriceTick: market.baseAssetMinPriceTick || 0,
                            baseAssetMaxPriceTick: market.baseAssetMaxPriceTick || 0,
                            poolAddress: market.poolAddress,
                            claimStatement: market.claimStatement || '',
                          }}
                          marketGroupAddress={group.address}
                          chainId={group.chainId}
                        />
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" disabled={buttonDisabled}>
                              {buttonText}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>{market.question}</DialogTitle>
                            </DialogHeader>
                            <SettleMarketDialog
                              market={market}
                              marketGroup={group}
                            />
                          </DialogContent>
                        </Dialog>
                      )
                    )}
                  </div>
                </div>
              );
            })
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

  return (
    <div className="container pt-16 lg:pt-24 max-w-3xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl">Control Center</h1>
        <div className="flex items-center space-x-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Launch New Market Group</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Launch New Market Group</DialogTitle>
              </DialogHeader>
              <CreateMarketGroupDialog />
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div>
        {isLoading && <p>Loading markets...</p>}
        {error && (
          <p className="text-red-500">Error loading markets: {error.message}</p>
        )}
        {marketGroups && marketGroups.length > 0 ? (
          <div className="space-y-8">
            {marketGroups.map((group) => (
              <MarketGroupContainer key={group.address || group.id} group={group} />
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
