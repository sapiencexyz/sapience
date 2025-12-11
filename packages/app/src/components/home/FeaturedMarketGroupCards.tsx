'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
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
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';

// Removed Loader in favor of simple fade-in cards and fixed-height placeholder

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
  const [predictionMap, setPredictionMap] = React.useState<
    Record<string, number>
  >({});

  const handlePredictionReady = React.useCallback(
    (conditionId: string, probability: number) => {
      setPredictionMap((prev) => {
        if (!conditionId) return prev;
        if (prev[conditionId] != null) return prev;
        return { ...prev, [conditionId]: probability };
      });
    },
    []
  );

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
    <section className="pt-0 px-0 w-full relative z-10">
      <div className="w-full px-0">
        {featuredConditions.length === 0 ? (
          <div className="relative" />
        ) : (
          <MobileAndDesktopLists
            items={featuredConditions}
            predictionMap={predictionMap}
            onPredictionReady={handlePredictionReady}
          />
        )}
      </div>
    </section>
  );
}

function MobileAndDesktopLists({
  items,
  predictionMap,
  onPredictionReady,
}: {
  items: FeaturedCondition[];
  predictionMap: Record<string, number>;
  onPredictionReady: (conditionId: string, probability: number) => void;
}) {
  const { state, openMobile } = useSidebar();
  const [mobileApi, setMobileApi] = React.useState<CarouselApi | null>(null);
  const [desktopApi, setDesktopApi] = React.useState<CarouselApi | null>(null);
  const hasRandomizedMobileStart = React.useRef(false);
  const hasRandomizedDesktopStart = React.useRef(false);
  const [hasShown, setHasShown] = React.useState(false);
  const minSlidesForScroll = 6;
  const memoItems = React.useMemo(() => items, [items]);
  const readyItems = React.useMemo(
    () => memoItems.filter((item) => item.id && predictionMap[item.id] != null),
    [memoItems, predictionMap]
  );
  const loopItems = React.useMemo(() => {
    if (readyItems.length === 0) return [];
    // Ensure enough slides to overflow on ultra-wide screens so auto-scroll runs.
    if (readyItems.length >= minSlidesForScroll) return readyItems;
    const repeated: typeof readyItems = [];
    for (let i = 0; i < minSlidesForScroll; i++) {
      repeated.push(readyItems[i % readyItems.length]);
    }
    return repeated;
  }, [readyItems, minSlidesForScroll]);
  const canAutoScroll = loopItems.length >= minSlidesForScroll;
  React.useEffect(() => {
    if (canAutoScroll && !hasShown) {
      setHasShown(true);
    }
  }, [canAutoScroll, hasShown]);
  const pendingItems = React.useMemo(
    () => memoItems.filter((item) => item.id && predictionMap[item.id] == null),
    [memoItems, predictionMap]
  );

  const autoScrollPluginMobile = React.useMemo(
    () =>
      autoScroll({
        playOnInit: true,
        stopOnMouseEnter: true,
        stopOnInteraction: true,
        speed: 0.9,
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
        speed: 0.9,
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
    if (readyItems.length === 0) return;
    const startIndex = Math.floor(Math.random() * readyItems.length);
    try {
      mobileApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedMobileStart.current = true;
  }, [mobileApi, readyItems.length]);

  // Randomize starting slide (desktop) once on init
  React.useEffect(() => {
    if (!desktopApi || hasRandomizedDesktopStart.current) return;
    if (readyItems.length === 0) return;
    const startIndex = Math.floor(Math.random() * readyItems.length);
    try {
      desktopApi.scrollTo(startIndex, true);
    } catch {
      console.error('Error scrolling to random index', startIndex);
    }
    hasRandomizedDesktopStart.current = true;
  }, [desktopApi, readyItems.length]);

  const desktopItemClass = React.useMemo(() => {
    return 'pl-0 w-auto flex-none';
  }, []);

  return (
    <div className="relative">
      {/* Prefetch prediction requests offscreen so cards only render once ready */}
      <div
        aria-hidden
        className="fixed top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none"
      >
        {pendingItems.map((c) => (
          <MarketPredictionRequest
            key={`prefetch-${c.id}-${c.categorySlug}`}
            conditionId={c.id}
            suppressLoadingPlaceholder
            skipViewportCheck
            onPrediction={(prob) => onPredictionReady(c.id, prob)}
          />
        ))}
      </div>

      {readyItems.length === 0 ? (
        <div className="relative" />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: hasShown ? 1 : 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ pointerEvents: hasShown ? 'auto' : 'none' }}
        >
          {/* Mobile: Embla carousel with auto-scroll */}
          <div className="md:hidden w-full px-0">
            <Carousel
              opts={{ loop: true, align: 'start', containScroll: 'trimSnaps' }}
              plugins={[autoScrollPluginMobile]}
              setApi={setMobileApi}
              className="w-full"
            >
              <CarouselContent className="items-stretch py-0">
                {loopItems.map((c, idx) => (
                  <React.Fragment key={`${c.id}-${idx}`}>
                    <CarouselItem className="pl-0 w-auto flex-none">
                      <TickerMarketCard
                        condition={{
                          id: c.id,
                          question: c.question,
                          shortName: c.shortName,
                          endTime: c.endTime,
                          description: c.description,
                          categorySlug: c.categorySlug,
                        }}
                        color={c.color}
                        predictionProbability={
                          c.id ? (predictionMap[c.id] ?? null) : null
                        }
                      />
                    </CarouselItem>
                    <CarouselItem className="w-px flex-none">
                      <div className="w-px h-full gold-hr-vertical" />
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
              <CarouselContent className="items-stretch py-0">
                {loopItems.map((c, idx) => (
                  <React.Fragment key={`${c.id}-${idx}`}>
                    <CarouselItem className={`${desktopItemClass}`}>
                      <TickerMarketCard
                        condition={{
                          id: c.id,
                          question: c.question,
                          shortName: c.shortName,
                          endTime: c.endTime,
                          description: c.description,
                          categorySlug: c.categorySlug,
                        }}
                        color={c.color}
                        predictionProbability={
                          c.id ? (predictionMap[c.id] ?? null) : null
                        }
                      />
                    </CarouselItem>
                    <CarouselItem className="w-px flex-none">
                      <div className="w-px h-full gold-hr-vertical" />
                    </CarouselItem>
                  </React.Fragment>
                ))}
              </CarouselContent>
            </Carousel>
          </div>
        </motion.div>
      )}
    </div>
  );
}
