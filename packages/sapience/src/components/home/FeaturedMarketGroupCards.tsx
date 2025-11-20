'use client';

import * as React from 'react';
import autoScroll from 'embla-carousel-auto-scroll';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@sapience/sdk/ui/components/ui/carousel';
import { useSidebar } from '@sapience/sdk/ui/components/ui/sidebar';
import TickerMarketCard from './ticker/TickerMarketCard';
import { useConditions } from '~/hooks/graphql/useConditions';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import { getActivePublicConditions } from './featuredConditions';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

// Removed LottieLoader in favor of simple fade-in cards and fixed-height placeholder

// Interface for featured conditions in the homepage carousel
interface FeaturedCondition {
  id: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  description?: string | null;
  color: string;
  categoryId: string;
  categorySlug: string;
}

export default function FeaturedMarketGroupCards() {
  // Fetch recent conditions for the currently selected chain
  const chainId = useChainIdFromLocalStorage();
  const { data: conditions, isLoading: isLoadingConditions } = useConditions({
    take: 100,
    chainId,
  });

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

  // Build featured conditions with category variety; target 8 items
  const featuredConditions: FeaturedCondition[] = React.useMemo(() => {
    if (!conditions) return [];

    const rng = createRng(randomSeed);
    const now = Math.floor(Date.now() / 1000);

    // 1) Active + public conditions
    const activePublic = getActivePublicConditions(conditions, now);

    // 2) Map with color metadata
    const mapped: FeaturedCondition[] = activePublic.map((c) => {
      const slug = c.category?.slug || '';
      const styleInfo = getCategoryStyle(slug);
      const color = styleInfo?.color || 'hsl(var(--muted-foreground))';
      return {
        id: c.id,
        question: c.question,
        shortName: c.shortName,
        endTime: c.endTime,
        description: c.description,
        color,
        categoryId: String(c.category?.id ?? ''),
        categorySlug: slug,
      };
    });

    // 3) One per category when possible
    const byCategory = mapped.reduce<Record<string, FeaturedCondition[]>>(
      (acc, cond) => {
        const key = cond.categoryId || 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(cond);
        return acc;
      },
      {}
    );

    const onePerCategory: FeaturedCondition[] = Object.values(byCategory)
      .map((conds) => {
        if (conds.length === 0) return null;
        const randomIndex = Math.floor(rng() * conds.length);
        return conds[randomIndex];
      })
      .filter((c): c is FeaturedCondition => c !== null);

    // 4) Shuffle and fill up to 8
    function shuffle<T>(arr: T[]): T[] {
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    const randomized = shuffle(onePerCategory);

    const selectedIds = new Set(randomized.map((c) => c.id));
    const remaining = shuffle(mapped.filter((c) => !selectedIds.has(c.id)));

    const filled: FeaturedCondition[] = [...randomized];
    for (const c of remaining) {
      if (filled.length >= 8) break;
      filled.push(c);
    }

    // 5) If still fewer than 8 items, repeat from start
    if (filled.length < 8 && filled.length > 0) {
      let i = 0;
      while (filled.length < 8) {
        filled.push(filled[i % filled.length]);
        i++;
        if (i > 32) break;
      }
    }

    return filled;
  }, [conditions, createRng, randomSeed]);

  if (isLoadingConditions) {
    return null;
  }

  return (
    <section className="pt-0 px-0 w-full relative z-10 font-mono">
      <div className="w-full px-0">
        {featuredConditions.length === 0 ? (
          <div className="relative" />
        ) : (
          <MobileAndDesktopLists items={featuredConditions} />
        )}
      </div>
    </section>
  );
}

function MobileAndDesktopLists({ items }: { items: FeaturedCondition[] }) {
  const { state, openMobile } = useSidebar();
  const [mobileApi, setMobileApi] = React.useState<CarouselApi | null>(null);
  const [desktopApi, setDesktopApi] = React.useState<CarouselApi | null>(null);
  const hasRandomizedMobileStart = React.useRef(false);
  const hasRandomizedDesktopStart = React.useRef(false);
  const memoItems = React.useMemo(() => items, [items]);

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
    if (memoItems.length === 0) return;
    const startIndex = Math.floor(Math.random() * memoItems.length);
    try {
      mobileApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedMobileStart.current = true;
  }, [mobileApi, memoItems.length]);

  // Randomize starting slide (desktop) once on init
  React.useEffect(() => {
    if (!desktopApi || hasRandomizedDesktopStart.current) return;
    if (memoItems.length === 0) return;
    const startIndex = Math.floor(Math.random() * memoItems.length);
    try {
      desktopApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedDesktopStart.current = true;
  }, [desktopApi, memoItems.length]);

  const desktopItemClass = React.useMemo(() => {
    return 'pl-2 w-auto flex-none';
  }, []);

  return (
    <div className="relative">
      {/* Mobile: Embla carousel with auto-scroll */}
      <div className="md:hidden w-full px-0">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginMobile]}
          setApi={setMobileApi}
          className="w-full"
        >
          <CarouselContent className="-ml-2 items-stretch py-3 md:py-4">
            {memoItems.map((c, idx) => (
              <React.Fragment key={`${c.id}-${idx}`}>
                <CarouselItem className="pl-2 w-auto flex-none">
                  <TickerMarketCard
                    condition={{
                      id: c.id,
                      question: c.question,
                      shortName: c.shortName,
                      endTime: c.endTime,
                      description: c.description,
                    }}
                    color={c.color}
                  />
                </CarouselItem>
                <CarouselItem className="pl-2 w-auto flex-none">
                  <div className="px-1 md:px-2 text-foreground/50 select-none flex items-stretch h-full">
                    <div className="w-px h-full bg-foreground/50" />
                  </div>
                </CarouselItem>
              </React.Fragment>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Desktop: Embla carousel with auto-scroll */}
      <div className="hidden md:block w-full px-0">
        <Carousel
          opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
          plugins={[autoScrollPluginDesktop]}
          setApi={setDesktopApi}
          className="w-full"
        >
          <CarouselContent className="-ml-2 items-stretch py-3 md:py-4">
            {memoItems.map((c, idx) => (
              <React.Fragment key={`${c.id}-${idx}`}>
                <CarouselItem className={`${desktopItemClass}`}>
                  <TickerMarketCard
                    condition={{
                      id: c.id,
                      question: c.question,
                      shortName: c.shortName,
                      endTime: c.endTime,
                      description: c.description,
                    }}
                    color={c.color}
                  />
                </CarouselItem>
                <CarouselItem className="pl-2 w-auto flex-none">
                  <div className="px-1 text-foreground/50 select-none flex items-stretch h-full">
                    <div className="w-px h-full bg-foreground/50" />
                  </div>
                </CarouselItem>
              </React.Fragment>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  );
}
