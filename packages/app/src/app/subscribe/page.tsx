'use client';

import { gql } from '@apollo/client';
import { Button } from '@foil/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@foil/ui/components/ui/dialog';
import Spline from '@splinetool/react-spline';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { print } from 'graphql';
import { ChartNoAxesColumn, Loader2, Plus } from 'lucide-react';
import Image from 'next/image';
import {
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import NumberDisplay from '~/components/numberDisplay';
import Subscribe from '~/components/subscribe';
import { useFoil } from '~/lib/context/FoilProvider';
import { PeriodContext, PeriodProvider } from '~/lib/context/PeriodProvider';
import { useResources } from '~/lib/hooks/useResources';
import { convertGgasPerWstEthToGwei, foilApi } from '~/lib/utils/util';

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
      isSettled
      epoch {
        id
        epochId
        startTimestamp
        endTimestamp
        market {
          id
          chainId
          address
        }
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
  entryPrice: number;
  transactions: {
    id: string;
    timestamp: number;
    type: string;
    baseToken: string;
    quoteToken: string;
    baseTokenDelta: string;
    quoteTokenDelta: string;
    tradeRatioD18: string;
  }[];
  createdAt: string;
}

const useSubscriptions = (address?: string) => {
  const { useMarketUnits } = useContext(PeriodContext);
  const { stEthPerToken } = useFoil();

  const calculateEntryPrice = (position: any, transactions: any[]) => {
    let entryPrice = 0;
    if (!position.isLP) {
      const isLong = BigInt(position.baseToken) > BigInt(0);
      if (isLong) {
        let baseTokenDeltaTotal = 0;
        entryPrice = transactions
          .filter((t: any) => Number(t.baseTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            baseTokenDeltaTotal += Number(transaction.baseTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.baseTokenDelta)
            );
          }, 0);
        entryPrice /= baseTokenDeltaTotal;
      } else {
        let quoteTokenDeltaTotal = 0;
        entryPrice = transactions
          .filter((t: any) => Number(t.quoteTokenDelta) > 0)
          .reduce((acc: number, transaction: any) => {
            quoteTokenDeltaTotal += Number(transaction.quoteTokenDelta);
            return (
              acc +
              Number(transaction.tradeRatioD18) *
                Number(transaction.quoteTokenDelta)
            );
          }, 0);
        entryPrice /= quoteTokenDeltaTotal;
      }
    }
    const unitsAdjustedEntryPrice = useMarketUnits
      ? entryPrice
      : convertGgasPerWstEthToGwei(entryPrice, stEthPerToken);
    return isNaN(unitsAdjustedEntryPrice) ? 0 : unitsAdjustedEntryPrice;
  };

  const fetchSubscriptions = async () => {
    if (!address) {
      return [];
    }

    // First fetch positions
    const { data: positionsData, errors } = await foilApi.post('/graphql', {
      query: print(SUBSCRIPTIONS_QUERY),
      variables: {
        owner: address,
      },
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    // Filter for active long positions
    const activePositions = positionsData.positions.filter(
      (position: any) =>
        !position.isLP && // Not an LP position
        BigInt(position.baseToken) > BigInt(0) && // Has positive baseToken
        !position.isSettled // Not settled
    );

    // For each position, fetch its transactions
    return Promise.all(
      activePositions.map(async (position: any) => {
        const contractId = `${position.epoch.market.chainId}:${position.epoch.market.address}`;
        const transactions = await foilApi.get(
          `/transactions?contractId=${contractId}&positionId=${position.positionId}`
        );

        return {
          ...position,
          entryPrice: calculateEntryPrice(position, transactions),
        };
      })
    );
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscriptions', address, useMarketUnits, stEthPerToken],
    queryFn: fetchSubscriptions,
    refetchInterval: 2000, // Refetch every 2 seconds
    enabled: !!address, // Only fetch when we have an address
  });

  return { data: data || [], isLoading, error };
};

function useIsInViewport(ref: React.RefObject<HTMLElement>) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return isIntersecting;
}

const SubscriptionsList = () => {
  const { address } = useAccount();
  const { data: subscriptions, isLoading, error } = useSubscriptions(address);
  const { data: resources, isLoading: isResourcesLoading } = useResources();
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Subscription | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useIsInViewport(containerRef);

  if (isLoading || isResourcesLoading) {
    return (
      <div className="flex justify-center items-center w-full my-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center my-6">
        Failed to load subscriptions:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }

  if (!address) {
    return (
      <div ref={containerRef} className="flex flex-col items-center">
        <div className="fixed h-screen w-screen top-[66%] md:top-[55%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[-1] opacity-50 blur-sm">
          {isInView && (
            <Spline scene="https://prod.spline.design/gyoZ1cjoFk5-20wQ/scene.splinecode" />
          )}
        </div>
        <div className="fixed z-10 max-w-[280px] md:max-w-[460px] text-white text-xl w-full md:text-4xl font-semibold tracking-wide text-center top-[66%] md:top-[55%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-100 bg-black/40 backdrop-blur-lg p-4 rounded-lg border border-accent/20 shadow-lg">
          Connect your wallet to view your subscriptions
        </div>
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="italic text-muted-foreground text-center lg:my-48 my-12">
        No active subscriptions are owned by the connected wallet
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {subscriptions.map((subscription) => {
        const resource = resources?.find((r) =>
          r.markets.some(
            (m) =>
              m.chainId === subscription.epoch.market.chainId &&
              m.address.toLowerCase() ===
                subscription.epoch.market.address.toLowerCase()
          )
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
              <h3 className="font-medium truncate text-2xl">
                {resource?.name || 'Unknown Resource'}
              </h3>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-sm font-medium">
                  <NumberDisplay
                    value={
                      Number(formatUnits(BigInt(subscription.baseToken), 9)) /
                      1e9
                    }
                  />{' '}
                  Ggas
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Entry Price
                </span>
                <span className="text-sm font-medium">
                  {Number(subscription.entryPrice).toFixed(4)} wstETH/Ggas
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

              {subscription.epoch.endTimestamp * 1000 > Date.now() && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Ends in</span>
                  <span className="text-sm font-medium">
                    {formatDistanceToNow(
                      new Date(subscription.epoch.endTimestamp * 1000),
                      { addSuffix: false }
                    )}
                  </span>
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full mt-3"
              onClick={() => {
                setSelectedPosition(subscription);
                setSellDialogOpen(true);
              }}
            >
              {subscription.epoch.endTimestamp * 1000 > Date.now()
                ? 'Close Early'
                : 'Settle'}
            </Button>
          </div>
        );
      })}

      <Dialog open={sellDialogOpen} onOpenChange={setSellDialogOpen}>
        <DialogContent className="max-w-[410px]">
          <DialogHeader>
            <DialogTitle>
              Close Position #{selectedPosition?.positionId}
            </DialogTitle>
          </DialogHeader>
          {selectedPosition && (
            <PeriodProvider
              chainId={selectedPosition.epoch.market.chainId}
              address={selectedPosition.epoch.market.address as `0x${string}`}
              epoch={selectedPosition.epoch.id}
            >
              <Subscribe
                positionId={selectedPosition.positionId}
                onClose={() => setSellDialogOpen(false)}
              />
            </PeriodProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SubscribeContent = () => {
  const { data: resources, isLoading } = useResources();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [prefilledSize, setPrefilledSize] = useState<bigint | null>(null);
  const [showActiveEpoch, setShowActiveEpoch] = useState(true);
  const { address } = useAccount();
  const [shouldOpenAfterConnect, setShouldOpenAfterConnect] = useState(false);

  // Add effect to open dialog when wallet is connected after button click
  useEffect(() => {
    if (address && shouldOpenAfterConnect) {
      setIsDialogOpen(true);
      setShouldOpenAfterConnect(false);
    }
  }, [address, shouldOpenAfterConnect]);

  const { markets } = useFoil();
  const currentTime = Math.floor(Date.now() / 1000);

  // Find all gas markets
  const gasMarkets = useMemo(() => {
    if (!resources) return [];
    const ethGasResource = resources.find((r) => r.name === 'Ethereum Gas');
    if (!ethGasResource) return [];

    // Filter markets based on the resource's markets array
    const filteredMarkets = markets.filter((market) =>
      ethGasResource.markets.some(
        (resourceMarket) =>
          resourceMarket.chainId === market.chainId &&
          resourceMarket.address.toLowerCase() === market.address.toLowerCase()
      )
    );

    console.log('Filtered Gas Markets:', filteredMarkets);
    return filteredMarkets;
  }, [markets, resources]);

  // Get all epochs from gas markets and find the target epoch
  const targetEpoch = useMemo(() => {
    if (!gasMarkets.length) return null;

    // Collect all epochs from gas markets with their corresponding market data
    const allEpochs = gasMarkets.flatMap((market) =>
      market.epochs.map((epoch) => ({
        ...epoch,
        market,
      }))
    );
    console.log('All Epochs:', allEpochs);

    // Sort epochs by start time
    const sortedEpochs = allEpochs.sort(
      (a, b) => a.startTimestamp - b.startTimestamp
    );

    // Find the next epoch that starts in the future
    const nextEpoch = sortedEpochs.find(
      (epoch) => epoch.startTimestamp > currentTime
    );

    // Find the active epoch (current epoch that has started but not ended)
    const activeEpoch = sortedEpochs.find(
      (epoch) =>
        epoch.startTimestamp <= currentTime && epoch.endTimestamp > currentTime
    );

    // Find the most recent epoch if no active or next epoch
    const mostRecentEpoch = sortedEpochs[sortedEpochs.length - 1] || null;

    // Check if we're within 7 days of active epoch's start time
    const isWithin7DaysOfActiveEpochStart =
      activeEpoch &&
      currentTime - activeEpoch.startTimestamp < 7 * 24 * 60 * 60; // 7 days in seconds

    // Logic for determining which epoch to show
    if (showActiveEpoch && activeEpoch && isWithin7DaysOfActiveEpochStart) {
      // Show active epoch if it exists and we're within 7 days of its start
      return activeEpoch;
    }

    // Default to next epoch or most recent if no next epoch
    return nextEpoch || mostRecentEpoch;
  }, [gasMarkets, currentTime, showActiveEpoch]);

  const handleNewSubscription = () => {
    setIsDialogOpen(true);
  };

  const handleAnalytics = () => {
    setIsAnalyticsOpen(true);
  };

  const toggleEpochView = () => {
    setShowActiveEpoch(!showActiveEpoch);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full lg:my-48 my-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!gasMarkets.length || !targetEpoch) {
    return (
      <div className="text-muted-foreground text-center my-6">
        Gas market not found
      </div>
    );
  }

  return (
    <PeriodProvider
      chainId={targetEpoch.market.chainId}
      address={targetEpoch.market.address}
      epoch={targetEpoch.epochId}
    >
      <div className="flex-1 flex flex-col">
        <div className="py-9 px-4">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex justify-between md:items-center mb-6 flex-col md:flex-row">
              <h1 className="text-3xl font-bold mb-4 md:mb-0">Subscriptions</h1>
              <div className="flex flex-row gap-3 md:gap-5 w-full md:w-auto">
                <Button variant="outline" onClick={handleAnalytics}>
                  <ChartNoAxesColumn className="text-muted-foreground" />
                  Wallet Analytics
                </Button>
                <Button onClick={handleNewSubscription}>
                  <Plus className="h-4 w-4" />
                  New Subscription
                </Button>
              </div>
            </div>

            <div className="flex-1">
              <SubscriptionsList />
            </div>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[410px]">
            <Subscribe
              initialSize={prefilledSize}
              onClose={() => setIsDialogOpen(false)}
              onPeriodToggle={toggleEpochView}
              isActiveEpoch={showActiveEpoch}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={isAnalyticsOpen} onOpenChange={setIsAnalyticsOpen}>
          <DialogContent className="max-w-[410px]">
            <DialogHeader>
              <DialogTitle className="text-2xl">Wallet Analytics</DialogTitle>
            </DialogHeader>
            <Subscribe
              onAnalyticsClose={(size) => {
                setPrefilledSize(size);
                setIsAnalyticsOpen(false);
                setIsDialogOpen(true);
              }}
              isAnalyticsMode
              onPeriodToggle={toggleEpochView}
              isActiveEpoch={showActiveEpoch}
            />
          </DialogContent>
        </Dialog>
      </div>
    </PeriodProvider>
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
