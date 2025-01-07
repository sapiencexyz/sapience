'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { useMarketList } from '~/lib/context/MarketListProvider';

const EarnContent = () => {
  const router = useRouter();
  const { markets, isLoading } = useMarketList();

  useEffect(() => {
    if (!isLoading && markets.length > 0) {
      const publicMarkets = markets.filter((market) => market.public);
      if (publicMarkets.length > 0) {
        const firstMarket = publicMarkets[0];
        router.replace(`/earn/${firstMarket.chainId}:${firstMarket.address}`);
      }
    }
  }, [markets, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return null;
};

const EarnPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center w-full m-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <EarnContent />
    </Suspense>
  );
};

export default EarnPage;
