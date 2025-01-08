'use client';

import { gql } from '@apollo/client';
import { formatDistanceToNow } from 'date-fns';
import { print } from 'graphql';
import { ChartNoAxesColumn, Loader2, Plus } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import Subscribe from '~/lib/components/foil/subscribe';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { useResources } from '~/lib/hooks/useResources';

const SUBSCRIPTIONS_QUERY = gql`
  query GetSubscriptions($owner: String!) {
    positions(owner: $owner) {
      id
      positionId
      isLP
      baseToken
      quoteToken
      borrowedBaseToken
      borrowedQuoteToken
      collateral
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        market {
          id
          chainId
          address
          name
        }
      }
      transactions {
        id
        timestamp
        type
        baseToken
        quoteToken
      }
    }
  }
`;

interface Subscription {
  id: number;
  positionId: number;
  epoch: {
    id: number;
    startTimestamp: number;
    endTimestamp: number;
    market: {
      chainId: number;
      address: string;
      name: string;
    };
  };
  baseToken: string;
  quoteToken: string;
  borrowedBaseToken: string;
  borrowedQuoteToken: string;
  collateral: string;
  transactions: {
    id: string;
    timestamp: number;
    type: string;
    baseToken: string;
    quoteToken: string;
  }[];
  createdAt: string;
}

const useSubscriptions = (address?: string) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubscriptions = async () => {
      if (!address) {
        setSubscriptions([]);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_FOIL_API_URL}/graphql`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: print(SUBSCRIPTIONS_QUERY),
              variables: {
                owner: address,
              },
            }),
          }
        );

        const { data, errors } = await response.json();
        if (errors) {
          throw new Error(errors[0].message);
        }

        // Filter for active long positions
        const activePositions = data.positions.filter(
          (position: any) =>
            !position.isLP && // Not an LP position
            BigInt(position.baseToken) > BigInt(0) // Has positive baseToken
        );

        setSubscriptions(activePositions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscriptions();
  }, [address]);

  return { data: subscriptions, isLoading, error };
};

const SubscriptionsList = () => {
  const { address } = useAccount();
  const { data: subscriptions, isLoading, error } = useSubscriptions(address);
  const { data: resources, isLoading: isResourcesLoading } = useResources();
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Subscription | null>(
    null
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full my-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center my-6">
        Failed to load subscriptions: {error}
      </div>
    );
  }

  if (!address) {
    return (
      <div className="text-muted-foreground text-center my-6">
        Connect your wallet to view your subscriptions
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-muted-foreground text-center my-6">
        No active subscriptions found
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {subscriptions.map((subscription) => {
        const resource = resources?.find(
          (r) => r.name === subscription.epoch.market.name
        );

        return (
          <div
            key={subscription.id}
            className="p-6 rounded-lg border bg-card text-card-foreground shadow-md space-y-4 flex flex-col"
          >
            <div className="flex items-center space-x-2">
              {resource && (
                <Image
                  src={resource.iconPath}
                  alt={resource.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <h3 className="font-medium truncate text-xl">
                {subscription.epoch.market.name}
              </h3>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-sm font-medium">
                  {formatUnits(BigInt(subscription.baseToken), 9)} Ggas
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Price Paid
                </span>
                <span className="text-sm font-medium">
                  {(() => {
                    // Find the first transaction that created the position
                    const createTx = subscription.transactions.find(
                      (t) => t.type === 'CREATE'
                    );
                    if (!createTx) return '0 Gwei';

                    // Calculate price as quoteToken/baseToken
                    const quoteAmount = BigInt(createTx.quoteToken);
                    const baseAmount = BigInt(createTx.baseToken);
                    if (baseAmount === BigInt(0)) return '0 Gwei';

                    const price = (quoteAmount * BigInt(1e9)) / baseAmount;
                    return `${formatUnits(price, 9)} Gwei`;
                  })()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Term</span>
                <span className="text-sm font-medium">
                  {new Date(
                    subscription.epoch.startTimestamp * 1000
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  -{' '}
                  {new Date(
                    subscription.epoch.endTimestamp * 1000
                  ).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Expires</span>
                <span className="text-sm font-medium">
                  in{' '}
                  {formatDistanceToNow(
                    new Date(subscription.epoch.endTimestamp * 1000),
                    { addSuffix: false }
                  )}
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full mt-3"
              onClick={() => {
                setSelectedPosition(subscription);
                setSellDialogOpen(true);
              }}
            >
              Close Early
            </Button>
          </div>
        );
      })}

      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              Close Position #{selectedPosition?.positionId}
            </DialogTitle>
          </DialogHeader>
          {selectedPosition && (
            <MarketProvider
              chainId={selectedPosition.epoch.market.chainId}
              address={selectedPosition.epoch.market.address as `0x${string}`}
              epoch={selectedPosition.epoch.id}
            >
              <Subscribe
                positionId={selectedPosition.positionId}
                onClose={() => setSellDialogOpen(false)}
              />
            </MarketProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SubscribeContent = () => {
  const { data: resources, isLoading } = useResources();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [estimationResults, setEstimationResults] = useState<{
    totalGasUsed: number;
    ethPaid: number;
    avgGasPerTx: number;
    avgGasPrice: number;
    chartData: { timestamp: number; value: number }[];
  } | null>(null);
  const [prefilledSize, setPrefilledSize] = useState<bigint | null>(null);

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );

  const { markets } = useMarketList();
  const currentTime = Math.floor(Date.now() / 1000);

  // Find the gas market
  const gasMarket = useMemo(
    () => markets.find((market) => market.name === 'Ethereum Gas'),
    [markets]
  );

  // Get the next epoch or most recent epoch
  const targetEpoch = useMemo(() => {
    if (!gasMarket) return null;

    // Sort epochs by start time
    const sortedEpochs = [...gasMarket.epochs].sort(
      (a, b) => a.startTimestamp - b.startTimestamp
    );

    // Find the next epoch that starts in the future
    const nextEpoch = sortedEpochs.find(
      (epoch) => epoch.startTimestamp > currentTime
    );

    // If no future epoch, get the most recent one
    return nextEpoch || sortedEpochs[sortedEpochs.length - 1] || null;
  }, [gasMarket, currentTime]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full m-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!gasMarket || !targetEpoch) {
    return (
      <div className="text-muted-foreground text-center my-6">
        Gas market not found
      </div>
    );
  }

  return (
    <MarketProvider
      chainId={gasMarket.chainId}
      address={gasMarket.address}
      epoch={targetEpoch.epochId}
    >
      <div className="flex-1 flex flex-col p-9">
        <div className="max-w-4xl mx-auto w-full">
          <div className="flex justify-between md:items-center mb-6 flex-col md:flex-row">
            <h1 className="text-3xl font-bold mb-4 md:mb-0">Subscriptions</h1>
            <div className="flex gap-5">
              <Button
                variant="outline"
                onClick={() => setIsAnalyticsOpen(true)}
              >
                <ChartNoAxesColumn className="text-muted-foreground" />
                Wallet Analytics
              </Button>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                New Subscription
              </Button>
            </div>
          </div>

          <SubscriptionsList />
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[460px]">
            <Subscribe initialSize={prefilledSize} />
          </DialogContent>
        </Dialog>

        <Dialog open={isAnalyticsOpen} onOpenChange={setIsAnalyticsOpen}>
          <DialogContent className="max-w-[460px]">
            <DialogHeader>
              <DialogTitle>Wallet Analytics</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Subscribe
                onAnalyticsClose={(size) => {
                  setPrefilledSize(size);
                  setIsAnalyticsOpen(false);
                  setIsDialogOpen(true);
                }}
                isAnalyticsMode
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MarketProvider>
  );
};

const SubscribePage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center w-full m-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
};

export default SubscribePage;
