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
import MarketCard from '../markets/MarketCard';
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

export default function FeaturedMarketGroupCards() {
  // Use the same hook as MarketGroupsList
  const { data: enrichedMarketGroups, isLoading: isLoadingMarketGroups } =
    useEnrichedMarketGroups();

  // Per-mount random seed to vary picks between mounts but keep them stable within a session
  const [randomSeed] = React.useState<number>(() => Math.random());

  // Simple seeded RNG (Mulberry32)
  const createRng = React.useCallback((seed: number) => {
    let t = Math.floor(seed * 0x7fffffff) >>> 0;
    return function rng() {
      t += 0x6d2b79f5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }, []);

  // Process market groups with same logic as MarketGroupsList but only take first 8
  const groupedMarketGroups: GroupedMarketGroup[] = React.useMemo(() => {
    if (!enrichedMarketGroups) return [];

    const rng = createRng(randomSeed);

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

    // 5. Randomize selection prioritizing category variety and avoiding repeats
    // Group by category and pick exactly one group per category that has at least one active market
    const byCategory = result.reduce<Record<string, GroupedMarketGroup[]>>(
      (acc, group) => {
        const key = group.categoryId || 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(group);
        return acc;
      },
      {}
    );

    // For each category, choose one representative active group at random (seeded)
    const onePerCategory: GroupedMarketGroup[] = Object.values(byCategory)
      .map((groups) => {
        const activeGroups = groups.filter((g) => g.isActive);
        if (activeGroups.length === 0) return null;
        const randomIndex = Math.floor(rng() * activeGroups.length);
        return activeGroups[randomIndex];
      })
      .filter((g): g is GroupedMarketGroup => g !== null);

    // Shuffle to randomize display order across categories
    function shuffle<T>(arr: T[]): T[] {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    const randomized = shuffle(onePerCategory);

    // Ensure we have at least 8 items; allow repeat categories if needed
    const selectedKeys = new Set(randomized.map((g) => g.key));
    const activePool = result.filter((g) => g.isActive);
    const remaining = shuffle(
      activePool.filter((g) => !selectedKeys.has(g.key))
    );

    const filled: GroupedMarketGroup[] = [...randomized];
    for (const g of remaining) {
      if (filled.length >= 8) break;
      filled.push(g);
    }

    // If still fewer than 8 total active groups exist, repeat from start
    if (filled.length < 8 && filled.length > 0) {
      let i = 0;
      while (filled.length < 8) {
        filled.push(filled[i % filled.length]);
        i++;
        // Safety to avoid infinite loop, though conditions should prevent it
        if (i > 32) break;
      }
    }

    return filled;
  }, [enrichedMarketGroups, createRng, randomSeed]);

  if (isLoadingMarketGroups) {
    return (
      <section className="pt-0 px-0 w-full relative z-10">
        <div className="w-full px-0">
          {/* Maintain space to prevent layout jump while data loads */}
          <div className="mt-0 mb-6 md:mb-4">
            <div className="h-[150px] md:h-[160px] w-full" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-0 px-0 w-full relative z-10">
      <div className="w-full px-0">
        {groupedMarketGroups.length === 0 ? (
          // Always reserve space, even when no items yet
          <div className="relative mt-0 md:mt-0 mb-6 md:mb-4 h-[150px] md:h-[160px]" />
        ) : (
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
  const hasRandomizedMobileStart = React.useRef(false);
  const hasRandomizedDesktopStart = React.useRef(false);
  const items = React.useMemo(() => groupedMarketGroups, [groupedMarketGroups]);

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

  // Randomize starting slide (mobile) once on init
  React.useEffect(() => {
    if (!mobileApi || hasRandomizedMobileStart.current) return;
    if (items.length === 0) return;
    const startIndex = Math.floor(Math.random() * items.length);
    try {
      mobileApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedMobileStart.current = true;
  }, [mobileApi, items.length]);

  // Randomize starting slide (desktop) once on init
  React.useEffect(() => {
    if (!desktopApi || hasRandomizedDesktopStart.current) return;
    if (items.length === 0) return;
    const startIndex = Math.floor(Math.random() * items.length);
    try {
      desktopApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedDesktopStart.current = true;
  }, [desktopApi, items.length]);

  const desktopItemClass = React.useMemo(() => {
    // Always show 3 items per row on desktop when possible
    if (items.length >= 3) return 'pl-8 basis-1/2 lg:basis-1/3 h-full';
    if (items.length === 2) return 'pl-8 basis-[60%] lg:basis-1/2 h-full';
    return 'pl-8 basis-[80%] lg:basis-2/3 h-full';
  }, [items.length]);

  return (
    <div className="relative mt-0 md:mt-0 mb-6 md:mb-4 min-h-[150px] md:min-h-[160px]">
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
      <div className="md:hidden w-full px-0 h-[150px]">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginMobile]}
          setApi={setMobileApi}
          className="w-full h-full"
        >
          <CarouselContent className="-ml-8 items-stretch h-full">
            {items.map((marketGroup) => (
              <CarouselItem
                key={marketGroup.key}
                className="pl-8 basis-[80%] h-full"
              >
                <MarketCard
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
      <div className="hidden md:block w-full px-0 h-[160px]">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginDesktop]}
          setApi={setDesktopApi}
          className="w-full h-full"
        >
          <CarouselContent className="-ml-8 items-stretch h-full">
            {items.map((marketGroup) => (
              <CarouselItem
                key={marketGroup.key}
                className={`${desktopItemClass} h-full`}
              >
                <MarketCard
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
