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

import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';

import CreateMarketDialog from './CreateMarketDialog';
import CreateMarketGroupDialog from './CreateMarketGroupDialog';
import SettleMarketDialog from './SettleMarketDialog';
import MarketGroupDeployButton from './MarketGroupDeployButton';
import MarketDeployButton from './MarketDeployButton';

const Admin = () => {
  const { data: marketGroups, isLoading, error } = useEnrichedMarketGroups();

  const formatTimestamp = (timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return formatDistanceToNow(date, { addSuffix: true });
  };

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
              <div key={group.address} className="border rounded-lg shadow-sm">
                <header className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
                  <h2 className="text-lg font-semibold">
                    {group.question || `Group: ${group.address}`}
                  </h2>
                  <div className="text-right text-sm text-gray-500">
                    <div>Chain ID: {group.chainId}</div>
                    <div>Address: {group.address}</div>
                  </div>
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

                        return (
                          <div
                            key={`${group.address}-${market.marketId}`}
                            className="flex items-center justify-between py-2"
                          >
                            <span className="font-medium">
                              ID: {market.marketId} - {market.question || 'No question available'}
                            </span>
                            <div className="flex items-center space-x-4">
                              <span className="text-sm text-gray-500">
                                ends {formatTimestamp(market.endTimestamp)}
                              </span>
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
                              <MarketDeployButton
                                market={market}
                                marketGroupAddress={group.address}
                                chainId={group.chainId}
                              />
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
