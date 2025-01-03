'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '~/components/ui/button';
import { MARKET_CATEGORIES } from '~/lib/constants/markets';
import { useMarketList } from '~/lib/context/MarketListProvider';

type NavType = 'category' | 'market';

interface MarketNavProps {
  type: NavType;
}

export const MarketNav = ({ type }: MarketNavProps) => {
  const { markets, isLoading } = useMarketList();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect to ethereum-gas if no category is selected
  if (type === 'category' && pathname === '/') {
    router.push('/ethereum-gas');
    return null;
  }

  if (type === 'market') {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    const publicMarkets = markets.filter(market => market.public);

    return (
      <div className="w-full border-b border-border">
        <div className="flex overflow-x-auto p-2 gap-2 no-scrollbar">
          {publicMarkets.map((market) => (
            <Link
              key={`${market.chainId}:${market.address}`}
              href={`/${market.chainId}:${market.address}`}
              className="flex-shrink-0"
            >
              <Button variant="outline" className="gap-2">
                {market.name}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const currentCategory = pathname.slice(1); // Remove leading slash

  return (
    <div className="w-full border-b border-border">
      <div className="flex overflow-x-auto p-2 gap-2 no-scrollbar">
        {MARKET_CATEGORIES.map((category) => {
          const isSelected = category.id === currentCategory;
          return (
            <Link
              key={category.id}
              href={`/${category.id}`}
              className="flex-shrink-0"
            >
              <Button 
                variant={isSelected ? "default" : "outline"} 
                className={`shadow-sm gap-2 ${isSelected ? 'pointer-events-none' : ''}`}
              >
                <Image 
                  src={category.iconPath} 
                  alt={category.name} 
                  width={16} 
                  height={16} 
                />
                {category.name}
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}; 