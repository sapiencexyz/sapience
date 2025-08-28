'use client';

import * as React from 'react';
import autoScroll from 'embla-carousel-auto-scroll';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@sapience/ui/components/ui/carousel';
import { useSidebar } from '@sapience/ui/components/ui/sidebar';
import { type Market as GraphQLMarketType } from '@sapience/ui/types/graphql';
import MarketGroupCard from '../markets/MarketGroupCard';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import type { MarketGroupClassification } from '~/lib/types';
import { getYAxisConfig, getMarketHeaderQuestion } from '~/lib/utils/util';

// Removed LottieLoader in favor of simple fade-in cards and fixed-height placeholder

// Define local interfaces based on MarketGroupsList structure
export interface MarketWithContext extends GraphQLMarketType {
  marketAddress: string;
  chainId: number;
  collateralAsset: string;
  categorySlug: string;
  categoryId: string;
}

// Interface for the final grouped market data structure
interface GroupedMarketGroup {
  key: string;
  marketAddress: string;
  chainId: number;
  marketName: string;
  collateralAsset: string;
  color: string;
  categorySlug: string;
  categoryId: string;
  marketQuestion?: string | null;
  markets: MarketWithContext[];
  displayQuestion?: string;
  isActive?: boolean;
  marketClassification?: MarketGroupClassification;
  displayUnit?: string;
}

export default function FeaturedMarketGroup() {
  // Use the same hook as MarketGroupsList
  const { data: enrichedMarketGroups, isLoading: isLoadingMarketGroups } =
    useEnrichedMarketGroups();

  // Process market groups with same logic as MarketGroupsList but only take first 8
  const groupedMarketGroups: GroupedMarketGroup[] = React.useMemo(() => {
    if (!enrichedMarketGroups) return [];

    // 1. Only consider deployed market groups and deployed markets
    const deployedGroups = enrichedMarketGroups.filter((group) => {
      const hasAddress =
        typeof group.address === 'string' && group.address.length > 0;
      const hasDeployedMarkets = Array.isArray(group.markets)
        ? group.markets.some(
            (m) =>
              typeof m.poolAddress === 'string' &&
              m.poolAddress.length > 0 &&
              m.poolAddress !== '0x'
          )
        : false;
      return hasAddress && hasDeployedMarkets;
    });

    // 2. Map to MarketWithContext[] (no category filter for homepage)
    const allMarkets: MarketWithContext[] = deployedGroups.flatMap(
      (marketGroup) => {
        return (
          marketGroup.markets
            // Only include deployed markets (with a valid poolAddress)
            .filter(
              (market) =>
                typeof market.poolAddress === 'string' &&
                market.poolAddress.length > 0 &&
                market.poolAddress !== '0x'
            )
            .filter(
              (market) =>
                // Ensure startTimestamp and endTimestamp are numbers
                typeof market.startTimestamp === 'number' &&
                typeof market.endTimestamp === 'number'
            )
            .map((market): MarketWithContext => {
              return {
                ...market,
                startTimestamp: market.startTimestamp,
                endTimestamp: market.endTimestamp,
                marketAddress: marketGroup.address!,
                chainId: marketGroup.chainId,
                collateralAsset: marketGroup.collateralAsset!,
                categorySlug: marketGroup.category.slug,
                categoryId: marketGroup.category.id.toString(),
              };
            })
        );
      }
    );

    // 2. Filter markets based on status (only active markets for homepage)
    const now = Math.floor(Date.now() / 1000);
    const filteredMarketsByStatus: MarketWithContext[] = allMarkets.filter(
      (market) => {
        if (
          typeof market.endTimestamp !== 'number' ||
          market.endTimestamp <= 0
        ) {
          return false;
        }
        if (!market.public) return false;
        // Only show active markets on homepage
        return now <= market.endTimestamp;
      }
    );

    // 3. Group filtered markets by market group key
    const groupedByMarketKey = filteredMarketsByStatus.reduce<
      Record<string, MarketWithContext[]>
    >((acc, market) => {
      const key = `${market.chainId}-${market.marketAddress}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(market);
      return acc;
    }, {});

    // 4. Convert grouped markets to GroupedMarketGroup[]
    const result: GroupedMarketGroup[] = Object.entries(groupedByMarketKey).map(
      ([key, markets]) => {
        const firstMarket = markets[0];
        const enrichedGroup = deployedGroups.find(
          (group) =>
            group.chainId === firstMarket.chainId &&
            group.address === firstMarket.marketAddress
        );

        if (!enrichedGroup) {
          throw new Error(`Could not find enriched group for key: ${key}`);
        }

        // Get display unit from yAxisConfig
        let displayUnit = '';
        if (enrichedGroup) {
          const yAxisConfig = getYAxisConfig(enrichedGroup);
          displayUnit = yAxisConfig.unit;
        }

        // Use the same question logic as the header
        // Determine the "active market" for header logic:
        // If there's only one market total, use that market; otherwise use null
        const allMarketsInGroup = enrichedGroup?.markets || [];
        const singleMarket =
          allMarketsInGroup.length === 1 ? allMarketsInGroup[0] : null;

        const displayQuestion = getMarketHeaderQuestion(
          enrichedGroup,
          singleMarket
        );

        return {
          key,
          marketAddress: firstMarket.marketAddress,
          chainId: firstMarket.chainId,
          marketName: enrichedGroup.question || '',
          collateralAsset: firstMarket.collateralAsset,
          color: enrichedGroup.category.color || '#71717a',
          categorySlug: firstMarket.categorySlug,
          categoryId: firstMarket.categoryId,
          marketQuestion: enrichedGroup.question,
          markets,
          displayQuestion,
          isActive: markets.some((market) => now <= market.endTimestamp!),
          marketClassification: enrichedGroup.marketClassification,
          displayUnit,
        };
      }
    );

    // 5. Sort by earliest end time and take first 8
    return result
      .sort((a, b) => {
        const aValidMarkets = a.markets.filter(
          (m) => typeof m.endTimestamp === 'number'
        );
        const bValidMarkets = b.markets.filter(
          (m) => typeof m.endTimestamp === 'number'
        );

        if (aValidMarkets.length === 0 || bValidMarkets.length === 0) {
          return 0; // Don't change order if no valid timestamps
        }

        const aEarliestEnd = Math.min(
          ...aValidMarkets.map((m) => m.endTimestamp as number)
        );
        const bEarliestEnd = Math.min(
          ...bValidMarkets.map((m) => m.endTimestamp as number)
        );
        return aEarliestEnd - bEarliestEnd;
      })
      .slice(0, 8);
  }, [enrichedMarketGroups]);

  if (isLoadingMarketGroups) {
    return (
      <section className="pt-0 px-0 w-full relative z-10">
        <div className="w-full px-0">
          {/* Maintain space to prevent layout jump while data loads */}
          <div className="mt-0 mb-1 md:mb-4">
            <div className="md:min-h-[150px] w-full" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-0 px-0 w-full relative z-10">
      <div className="w-full px-0">
        {groupedMarketGroups.length === 0 ? null : (
          <MobileAndDesktopLists groupedMarketGroups={groupedMarketGroups} />
        )}
      </div>
    </section>
  );
}

function MobileAndDesktopLists({
  groupedMarketGroups,
}: {
  groupedMarketGroups: GroupedMarketGroup[];
}) {
  const { state, openMobile } = useSidebar();
  const [mobileApi, setMobileApi] = React.useState<CarouselApi | null>(null);
  const [desktopApi, setDesktopApi] = React.useState<CarouselApi | null>(null);
  const items = React.useMemo(
    () => groupedMarketGroups.slice(0, 8),
    [groupedMarketGroups]
  );

  const autoScrollPluginMobile = React.useMemo(
    () =>
      autoScroll({
        playOnInit: true,
        stopOnMouseEnter: true,
        stopOnInteraction: true,
        speed: 0.5,
      }),
    []
  );

  const autoScrollPluginDesktop = React.useMemo(
    () =>
      autoScroll({
        playOnInit: true,
        // Keep autoscrolling even when hovered on desktop
        stopOnMouseEnter: false,
        stopOnInteraction: true,
        speed: 0.5,
      }),
    []
  );

  // Reinitialize carousels when the sidebar open/collapsed state changes
  React.useEffect(() => {
    mobileApi?.reInit();
    desktopApi?.reInit();
  }, [state, openMobile, mobileApi, desktopApi]);

  const desktopItemClass = React.useMemo(() => {
    if (items.length >= 4) return 'pl-4 basis-1/2 lg:basis-1/4';
    if (items.length === 3) return 'pl-4 basis-1/2';
    if (items.length === 2) return 'pl-4 basis-[60%]';
    return 'pl-4 basis-[80%]';
  }, [items.length]);

  return (
    <div className="relative mt-0 mb-1 md:mb-4 md:min-h-[150px]">
      {/* Fade overlays */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 md:w-16 bg-gradient-to-r from-background to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 md:w-16 bg-gradient-to-l from-background to-transparent"
        aria-hidden
      />
      {/* Mobile: Embla carousel with auto-scroll */}
      <div className="md:hidden w-full px-0">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginMobile]}
          setApi={setMobileApi}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {items.map((marketGroup) => (
              <CarouselItem key={marketGroup.key} className="pl-4 basis-[80%]">
                <MarketGroupCard
                  chainId={marketGroup.chainId}
                  marketAddress={marketGroup.marketAddress}
                  market={marketGroup.markets}
                  color={marketGroup.color}
                  displayQuestion={
                    marketGroup.displayQuestion || marketGroup.marketName
                  }
                  isActive={marketGroup.isActive}
                  marketClassification={marketGroup.marketClassification}
                  displayUnit={marketGroup.displayUnit}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Dewtop: Embla carousel with auto-scroll */}
      <div className="hidden md:block w-full px-0">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginDesktop]}
          setApi={setDesktopApi}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {items.map((marketGroup) => (
              <CarouselItem key={marketGroup.key} className={desktopItemClass}>
                <MarketGroupCard
                  chainId={marketGroup.chainId}
                  marketAddress={marketGroup.marketAddress}
                  market={marketGroup.markets}
                  color={marketGroup.color}
                  displayQuestion={
                    marketGroup.displayQuestion || marketGroup.marketName
                  }
                  isActive={marketGroup.isActive}
                  marketClassification={marketGroup.marketClassification}
                  displayUnit={marketGroup.displayUnit}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
