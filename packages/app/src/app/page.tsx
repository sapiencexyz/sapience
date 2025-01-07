'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { MarketLayout } from '~/lib/components/market/MarketLayout';
import { ResourceNav } from '~/lib/components/market/ResourceNav';
import { useMarketList } from '~/lib/context/MarketListProvider';

const ExploreContent = () => {
  const router = useRouter();
  const { markets, isLoading } = useMarketList();

  useEffect(() => {
    if (!isLoading && markets.length > 0) {
      const publicMarkets = markets.filter((market) => market.public);
      if (publicMarkets.length > 0) {
        const firstMarket = publicMarkets[0];
        router.replace(`/${firstMarket.chainId}:${firstMarket.address}`);
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

const HomePage = () => {
  return (
    <MarketLayout
      nav={<ResourceNav type="market" />}
      content={<ExploreContent />}
    />
  );
};

export default HomePage;
