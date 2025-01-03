'use client';

import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketProvider } from '~/lib/context/MarketProvider';

const SubscribeContent = () => {
  const { markets, isLoading } = useMarketList();
  const searchParams = useSearchParams();

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );
  const [chainId, setChainId] = useState<number>(
    chainIdParam ? Number(chainIdParam) : markets[0]?.chainId
  );
  const [marketAddress, setMarketAddress] = useState<string>(
    marketAddressParam || markets[0]?.address
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center w-full m-10">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <MarketProvider chainId={chainId} address={marketAddress} epoch={Number(1)}>
      <div className="flex-1 flex p-6">
        <div className="m-auto border border-border rounded-md p-6 max-w-[460px]">
          <Subscribe showMarketSwitcher />
        </div>
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