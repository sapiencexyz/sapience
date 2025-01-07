'use client';

import { gql } from '@apollo/client';
import { print } from 'graphql';
import { Loader2, Plus } from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import Subscribe from '~/lib/components/foil/subscribe';
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
      }
    }
  }
`;

interface Subscription {
  id: number;
  positionId: number;
  market: {
    chainId: number;
    address: string;
    name: string;
  };
  epoch: {
    id: number;
    startTimestamp: number;
    endTimestamp: number;
  };
  baseToken: string;
  quoteToken: string;
  borrowedBaseToken: string;
  borrowedQuoteToken: string;
  collateral: string;
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
                owner: address.toLowerCase(),
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
    <div className="space-y-4">
      {subscriptions.map((subscription) => (
        <div
          key={subscription.id}
          className="p-4 rounded-lg border bg-card text-card-foreground"
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-medium">{subscription.market.name}</h3>
              <p className="text-sm text-muted-foreground">
                Position #{subscription.positionId}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm">
                Collateral: {formatUnits(BigInt(subscription.collateral), 18)}{' '}
                ETH
              </p>
              <p className="text-sm text-muted-foreground">
                Created {new Date(subscription.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="text-sm grid grid-cols-2 gap-2">
            <div>
              <p>
                Base Token: {formatUnits(BigInt(subscription.baseToken), 18)}
              </p>
              <p>
                Quote Token: {formatUnits(BigInt(subscription.quoteToken), 18)}
              </p>
            </div>
            <div>
              <p>
                Borrowed Base:{' '}
                {formatUnits(BigInt(subscription.borrowedBaseToken), 18)}
              </p>
              <p>
                Borrowed Quote:{' '}
                {formatUnits(BigInt(subscription.borrowedQuoteToken), 18)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SubscribeContent = () => {
  const { data: resources, isLoading } = useResources();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );
  const [chainId, setChainId] = useState<number>(
    chainIdParam ? Number(chainIdParam) : 1 // Default to Ethereum mainnet
  );
  const [marketAddress, setMarketAddress] = useState<string>(
    marketAddressParam || ''
  );

  useEffect(() => {
    if (marketAddressParam) {
      setMarketAddress(marketAddressParam);
    }
  }, [marketAddressParam]);

  useEffect(() => {
    if (chainIdParam) {
      setChainId(Number(chainIdParam));
    }
  }, [chainIdParam]);

  const handleResourceSelect = (resource: { slug: string; name: string }) => {
    // TODO: We'll need to get the market address and chain ID based on the resource
    // For now, we'll just open the dialog
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full m-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MarketProvider chainId={chainId} address={marketAddress} epoch={Number(1)}>
      <div className="flex-1 flex flex-col p-6">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Subscriptions</h1>
            <Popover>
              <PopoverTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" />
                  New Subscription
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-2">
                <div className="space-y-2">
                  {resources?.map((resource) => (
                    <button
                      key={resource.id}
                      type="button"
                      onClick={() => handleResourceSelect(resource)}
                      className="w-full flex items-center space-x-2 p-2 hover:bg-muted rounded-md transition-colors"
                    >
                      <Image
                        src={resource.iconPath}
                        alt={resource.name}
                        width={20}
                        height={20}
                      />
                      <span className="flex-1 text-left">{resource.name}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <SubscriptionsList />
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-[460px]">
            <Subscribe showMarketSwitcher={false} />
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
