/**
 * Market grouping and transformation logic
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import type {
  PolymarketMarket,
  SapienceCondition,
  SapienceConditionGroup,
  SapienceOutput,
  SapienceCategorySlug,
} from '../types';
import { CHAIN_ID_ETHEREAL, LLM_ENABLED, OPENROUTER_API_KEY, LLM_MODEL, DEFAULT_SAPIENCE_API_URL } from '../constants';
import { inferSapienceCategorySlug } from './category';
import { transformMatchQuestion, getPolymarketUrl } from './transform';
import { enrichMarketsWithLLM, type MarketEnrichmentOutput } from '../llm';
import {
  runPipeline,
  printPipelineStats,
  GROUP_FILTERS,
  UNGROUPED_MARKET_FILTERS,
  createLlmPreFilter,
  checkExistingConditions,
  type MarketGroup,
} from './pipeline';

/**
 * Compute group category by majority vote from its conditions
 */
export function computeGroupCategory(conditions: SapienceCondition[]): SapienceCategorySlug {
  const counts = new Map<SapienceCategorySlug, number>();

  for (const condition of conditions) {
    counts.set(condition.categorySlug, (counts.get(condition.categorySlug) || 0) + 1);
  }

  // Find category with most votes
  let maxCount = 0;
  let majorityCategory: SapienceCategorySlug = 'geopolitics';

  for (const [category, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      majorityCategory = category;
    }
  }

  return majorityCategory;
}

export function transformToSapienceCondition(
  market: PolymarketMarket,
  groupTitle?: string,
  enrichment?: MarketEnrichmentOutput
): SapienceCondition {
  // Transform "X vs Y" questions to "X beats Y?" for clarity
  const question = transformMatchQuestion(market);

  return {
    conditionHash: market.conditionId,  // Use Polymarket's conditionId directly
    question,
    shortName: enrichment?.shortName || question,  // Use LLM shortName or fallback to question
    endDate: market.endDate,
    description: market.description || '',
    similarMarkets: [getPolymarketUrl(market)],
    categorySlug: enrichment?.category || inferSapienceCategorySlug(market),  // Use LLM category or fallback
    chainId: CHAIN_ID_ETHEREAL,
    groupTitle,
  };
}

export async function groupMarkets(
  markets: PolymarketMarket[],
  apiUrl: string = DEFAULT_SAPIENCE_API_URL
): Promise<SapienceOutput> {
  const allGroups: MarketGroup[] = [];
  const ungrouped: PolymarketMarket[] = [];

  // Each market with an event becomes its own group entry (not bundled with other markets from same event)
  for (const market of markets) {
    const event = market.events?.[0];

    if (event?.title) {
      // Each market is its own "group" with 1 market
      allGroups.push({
        title: event.title,
        markets: [market],
        eventSlug: event.slug,
      });
    } else {
      ungrouped.push(market);
    }
  }

  // Apply group filters pipeline (volume OR always-include)
  const { output: filteredGroups, stats: groupStats } = runPipeline(
    allGroups,
    GROUP_FILTERS,
    { verbose: false }
  );
  printPipelineStats(groupStats, 'Volume Filter');

  // Apply ungrouped market filters pipeline
  const { output: filteredUngrouped, stats: ungroupedStats } = runPipeline(
    ungrouped,
    UNGROUPED_MARKET_FILTERS,
    { verbose: false }
  );
  printPipelineStats(ungroupedStats, 'Ungrouped Pipeline');

  // Collect all markets for processing
  const allFilteredMarkets = [
    ...filteredGroups.map(g => g.markets[0]),
    ...filteredUngrouped,
  ];

  // Check which conditions already exist (to skip LLM for them)
  const allConditionIds = allFilteredMarkets.map(m => m.conditionId);
  const existingIds = await checkExistingConditions(apiUrl, allConditionIds);

  // Apply LLM pre-filter pipeline to separate new vs existing markets
  const { output: newMarkets, stats: llmFilterStats } = runPipeline(
    allFilteredMarkets,
    createLlmPreFilter(existingIds),
    { verbose: false }
  );
  printPipelineStats(llmFilterStats, 'LLM Pre-Filter');

  // Only enrich NEW markets with LLM (category + shortName)
  const enrichments = await enrichMarketsWithLLM(newMarkets, {
    enabled: LLM_ENABLED,
    apiKey: OPENROUTER_API_KEY,
    model: LLM_MODEL,
  });

  // Filter out existing markets from groups and ungrouped (no need to submit them)
  const newGroups = filteredGroups.filter(g => !existingIds.has(g.markets[0].conditionId));
  const newUngrouped = filteredUngrouped.filter(m => !existingIds.has(m.conditionId));

  // Transform single-market groups to SapienceConditionGroup[]
  const conditionGroups: SapienceConditionGroup[] = [];

  for (const group of newGroups) {
    const market = group.markets[0]; // Each group has exactly 1 market now
    const enrichment = enrichments.get(market.conditionId);
    const condition = transformToSapienceCondition(market, group.title, enrichment);

    // Use event description if available, otherwise use market's description
    const event = market.events?.[0];
    const groupDescription = event?.description?.split('\n')[0] ||
                            market.description?.split('\n')[0] ||
                            group.title;

    conditionGroups.push({
      title: group.title,
      description: groupDescription,
      categorySlug: condition.categorySlug,
      similarMarkets: [`https://polymarket.com#${group.eventSlug}`],
      conditions: [condition],
    });
  }

  // Create ungrouped conditions from markets without events
  const ungroupedConditions = newUngrouped.map(m =>
    transformToSapienceCondition(m, undefined, enrichments.get(m.conditionId))
  );

  // Count total conditions after filtering
  const totalConditions = conditionGroups.reduce((sum, g) => sum + g.conditions.length, 0) + ungroupedConditions.length;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'Polymarket Gamma API',
      totalConditions,
      totalGroups: conditionGroups.length,
      binaryConditions: totalConditions,
    },
    groups: conditionGroups,
    ungroupedConditions,
  };
}

export function exportJSON(data: SapienceOutput, filename: string = 'sapience-conditions.json'): void {
  const outputPath = join(process.cwd(), filename);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Exported to ${outputPath}`);
}
