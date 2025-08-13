'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { type Market as GraphQLMarketType } from '@sapience/ui/types/graphql';
import MarketGroupsRow from '../forecasting/MarketGroupsRow';
import { useEnrichedMarketGroups } from '~/hooks/graphql/useMarketGroups';
import type { MarketGroupClassification } from '~/lib/types';
import { getYAxisConfig, getMarketHeaderQuestion } from '~/lib/utils/util';

// Dynamically import LottieLoader
const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

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

  // Process market groups with same logic as MarketGroupsList but only take first 5
  const groupedMarketGroups: GroupedMarketGroup[] = React.useMemo(() => {
    if (!enrichedMarketGroups) return [];

    // 1. Map enrichedMarketGroups to MarketWithContext[] (no category filter for homepage)
    const allMarkets: MarketWithContext[] = enrichedMarketGroups.flatMap(
      (marketGroup) => {
        // Filter and map markets within this marketGroup
        return marketGroup.markets
          .filter(
            (market) =>
              // Ensure startTimestamp and endTimestamp are numbers
              typeof market.startTimestamp === 'number' &&
              typeof market.endTimestamp === 'number'
          )
          .map((market): MarketWithContext => {
            return {
              ...market,
              // Explicitly assign core GraphQLMarketType properties
              startTimestamp: market.startTimestamp,
              endTimestamp: market.endTimestamp,
              // Add context fields from marketGroup
              marketAddress: marketGroup.address!,
              chainId: marketGroup.chainId,
              collateralAsset: marketGroup.collateralAsset!,
              categorySlug: marketGroup.category.slug,
              categoryId: marketGroup.category.id.toString(),
            };
          });
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
        const enrichedGroup = enrichedMarketGroups.find(
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

    // 5. Sort by earliest end time and take first 5
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
      .slice(0, 5);
  }, [enrichedMarketGroups]);

  if (isLoadingMarketGroups) {
    return (
      <section className="pt-8 lg:pt-12 px-4 sm:px-6 w-full relative z-10">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col items-center justify-center text-center">
            <LottieLoader width={32} height={32} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-8 lg:pt-12 px-4 sm:px-6 w-full relative z-10">
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row items-start lg:items-center lg:justify-center gap-8 lg:gap-28">
          {/* Content constrained to match other sections */}
          <div className="w-full lg:w-4/5 lg:max-w-4xl">
            {groupedMarketGroups.length === 0 ? (
              <div className="text-center">
                <p className="text-lg text-muted-foreground">
                  No active market groups available
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="mb-2">
                  <h3 className="font-medium text-sm text-muted-foreground mb-2">
                    Settling Soon
                  </h3>
                  <div className="border border-muted rounded shadow-sm bg-background/50 overflow-hidden">
                    {groupedMarketGroups.map((marketGroup) => (
                      <div
                        key={marketGroup.key}
                        className="border-b last:border-b-0 border-border"
                      >
                        <MarketGroupsRow
                          chainId={marketGroup.chainId}
                          marketAddress={marketGroup.marketAddress}
                          market={marketGroup.markets}
                          color={marketGroup.color}
                          displayQuestion={
                            marketGroup.displayQuestion ||
                            marketGroup.marketName
                          }
                          isActive={marketGroup.isActive}
                          marketClassification={
                            marketGroup.marketClassification
                          }
                          displayUnit={marketGroup.displayUnit}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
