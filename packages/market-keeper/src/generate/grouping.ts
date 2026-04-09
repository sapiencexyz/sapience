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
  MetadataUpdate,
  SyncableFields,
} from '../types';
import {
  CHAIN_ID,
  LLM_ENRICHMENT_ENABLED,
  LLM_ENDTIME_SEARCH_ENABLED,
  OPENROUTER_API_KEY,
  LLM_MODEL,
  LLM_ENDTIME_MODEL,
  DEFAULT_SAPIENCE_API_URL,
} from '../constants';
import { inferSapienceCategorySlug } from './category';
import { transformMatchQuestion, getPolymarketUrl } from './transform';
import {
  enrichMarketsWithLLM,
  enrichEndTimesWithLLM,
  resolveShortName,
  type MarketEnrichmentOutput,
} from '../llm';
import { fetchEventTags } from './tags';
import { parseYesPrice } from '../utils/price';
import {
  runPipeline,
  printPipelineStats,
  GROUP_FILTERS,
  UNGROUPED_MARKET_FILTERS,
  createLlmPreFilter,
  checkExistingConditions,
  type MarketGroup,
  type ExistingCondition,
} from './pipeline';

/**
 * Compute group category by majority vote from its conditions
 */
export function computeGroupCategory(
  conditions: SapienceCondition[]
): SapienceCategorySlug {
  const counts = new Map<SapienceCategorySlug, number>();

  for (const condition of conditions) {
    counts.set(
      condition.categorySlug,
      (counts.get(condition.categorySlug) || 0) + 1
    );
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
  enrichment?: MarketEnrichmentOutput,
  tags: string[] = [],
  endTimeOverride?: number
): SapienceCondition {
  // Transform "X vs Y" questions to "X beats Y?" for clarity
  const question = transformMatchQuestion(market);

  // shortName priority: groupItemTitle > LLM/regex enrichment > question fallback
  const shortName =
    market.groupItemTitle?.trim() || enrichment?.shortName || question;

  return {
    conditionHash: market.conditionId, // Use Polymarket's conditionId directly
    question,
    shortName,
    endDate: market.endDate,
    description: market.description || '',
    similarMarkets: [getPolymarketUrl(market)],
    tags,
    categorySlug: enrichment?.category || inferSapienceCategorySlug(market), // Use LLM category or fallback
    chainId: CHAIN_ID,
    groupTitle,
    estimatedPrice: parseYesPrice(market.outcomePrices),
    similarMarketVolume: parseFloat(market.volume || '0') || 0,
    similarMarketImage: market.image,
    endTimeOverride,
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
      // Rare: Polymarket markets without an associated event.
      // These become ungrouped conditions (no condition_group row).
      ungrouped.push(market);
    }
  }

  // Fetch event tags from Polymarket /events endpoint
  // Compute date range from markets for the events query
  const endDates = markets
    .map((m) => new Date(m.endDate).getTime())
    .filter((t) => !isNaN(t));
  const endDateMin = new Date(
    Math.min(Date.now(), ...endDates) - 60 * 1000
  ).toISOString();
  const endDateMax = new Date(
    Math.max(Date.now(), ...endDates) + 24 * 60 * 60 * 1000
  ).toISOString();
  const eventTagMap = await fetchEventTags({ endDateMin, endDateMax });

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
    ...filteredGroups.map((g) => g.markets[0]),
    ...filteredUngrouped,
  ];

  // Check which conditions already exist (to skip LLM for them)
  const allConditionIds = allFilteredMarkets.map((m) => m.conditionId);
  const existingIds = await checkExistingConditions(apiUrl, allConditionIds);

  // Compute metadata updates for existing conditions by diffing against fresh Polymarket data
  const metadataUpdates = computeMetadataUpdates(
    allFilteredMarkets,
    filteredGroups,
    existingIds,
    eventTagMap
  );

  // Apply LLM pre-filter pipeline to separate new vs existing markets
  const { output: newMarkets, stats: llmFilterStats } = runPipeline(
    allFilteredMarkets,
    createLlmPreFilter(existingIds),
    { verbose: false }
  );
  printPipelineStats(llmFilterStats, 'LLM Pre-Filter');

  // Enrich NEW markets with LLM — category/shortName and endTime run in parallel
  const [enrichments, endTimeMap] = await Promise.all([
    enrichMarketsWithLLM(newMarkets, {
      enabled: LLM_ENRICHMENT_ENABLED,
      apiKey: OPENROUTER_API_KEY,
      model: LLM_MODEL,
    }),
    enrichEndTimesWithLLM(newMarkets, {
      enabled: LLM_ENDTIME_SEARCH_ENABLED,
      apiKey: OPENROUTER_API_KEY,
      model: LLM_ENDTIME_MODEL,
    }),
  ]);

  // Filter out existing markets from groups and ungrouped (no need to submit them)
  const newGroups = filteredGroups.filter(
    (g) => !existingIds.has(g.markets[0].conditionId)
  );
  const newUngrouped = filteredUngrouped.filter(
    (m) => !existingIds.has(m.conditionId)
  );

  // Transform single-market groups to SapienceConditionGroup[]
  const conditionGroups: SapienceConditionGroup[] = [];

  for (const group of newGroups) {
    const market = group.markets[0]; // Each group has exactly 1 market now
    const enrichment = enrichments.get(market.conditionId);
    const eventSlug = market.events?.[0]?.slug;
    const marketTags = eventSlug ? (eventTagMap.get(eventSlug) ?? []) : [];
    const condition = transformToSapienceCondition(
      market,
      group.title,
      enrichment,
      marketTags,
      endTimeMap.get(market.conditionId)
    );

    // Use event description if available, otherwise use market's description
    const event = market.events?.[0];
    const groupDescription =
      event?.description?.split('\n')[0] ||
      market.description?.split('\n')[0] ||
      group.title;

    conditionGroups.push({
      title: group.title,
      description: groupDescription,
      categorySlug: condition.categorySlug,
      similarMarkets: [`https://polymarket.com#${group.eventSlug}`],
      tags: marketTags,
      conditions: [condition],
    });
  }

  // Create ungrouped conditions from markets without events
  const ungroupedConditions = newUngrouped.map((m) => {
    const slug = m.events?.[0]?.slug;
    const mTags = slug ? (eventTagMap.get(slug) ?? []) : [];
    return transformToSapienceCondition(
      m,
      undefined,
      enrichments.get(m.conditionId),
      mTags,
      endTimeMap.get(m.conditionId)
    );
  });

  // Count total conditions after filtering
  const totalConditions =
    conditionGroups.reduce((sum, g) => sum + g.conditions.length, 0) +
    ungroupedConditions.length;

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
    metadataUpdates,
  };
}

/**
 * Compute fresh Polymarket-owned metadata for a market, matching the shape
 * of the fields that transformToSapienceCondition writes on initial create.
 * Kept as a single source of truth so the diff and the create paths agree.
 */
function freshMetadataFor(
  market: PolymarketMarket,
  groupTitle: string | undefined,
  tags: string[]
): SyncableFields {
  return {
    question: transformMatchQuestion(market),
    description: market.description || '',
    similarMarkets: [getPolymarketUrl(market)],
    tags,
    similarMarketVolume: parseFloat(market.volume || '0') || 0,
    similarMarketImage: market.image,
    groupName: groupTitle,
  };
}

/**
 * Order-insensitive equality for scalar | string[] fields. Arrays compare
 * as sets since Polymarket can reshuffle tag/similarMarkets ordering
 * without any semantic change.
 */
function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return a === b;
}

/**
 * Compare existing conditions in the DB against fresh Polymarket data and
 * emit a list of updates for any Polymarket-owned field that has drifted.
 * The conditionId is the stable identity anchor — everything else in
 * SyncableFields is re-derived from the current Polymarket market and
 * pushed back if it differs from what we have stored.
 */
function computeMetadataUpdates(
  markets: PolymarketMarket[],
  groups: Array<{
    title: string;
    markets: PolymarketMarket[];
    eventSlug?: string;
  }>,
  existingIds: Map<string, ExistingCondition>,
  eventTagMap: Map<string, string[]>
): MetadataUpdate[] {
  // Build a lookup from conditionId → group info across ALL markets in each
  // group (not just group.markets[0]) so multi-market groups sync every
  // member. Today every group is single-market, but this keeps the diff
  // correct if that ever changes.
  const groupByConditionId = new Map<
    string,
    { title: string; eventSlug?: string }
  >();
  for (const group of groups) {
    for (const market of group.markets) {
      groupByConditionId.set(market.conditionId, {
        title: group.title,
        eventSlug: group.eventSlug,
      });
    }
  }

  const updates: MetadataUpdate[] = [];

  for (const market of markets) {
    const existing = existingIds.get(market.conditionId);
    if (!existing) continue;

    const groupInfo = groupByConditionId.get(market.conditionId);
    const tagsForMarket = groupInfo?.eventSlug
      ? (eventTagMap.get(groupInfo.eventSlug) ?? [])
      : [];
    const fresh = freshMetadataFor(market, groupInfo?.title, tagsForMarket);

    const fields: SyncableFields = {};
    const old: SyncableFields = {};

    // Iterate every syncable key. Undefined/null on the fresh side means
    // "we don't own this value right now" → skip, never blank out DB state.
    const keys: (keyof SyncableFields)[] = [
      'question',
      'description',
      'similarMarkets',
      'tags',
      'similarMarketVolume',
      'similarMarketImage',
      'groupName',
    ];
    for (const key of keys) {
      const newVal = fresh[key];
      if (newVal === undefined || newVal === null) continue;
      const oldVal = existing[key];
      if (!fieldsEqual(oldVal, newVal)) {
        // Dynamic assignment — `fields` and `old` share the SyncableFields
        // shape so key-by-key writes are type-safe but TS can't narrow it.
        (fields as Record<string, unknown>)[key] = newVal;
        (old as Record<string, unknown>)[key] = oldVal;
      }
    }

    // shortName priority: groupItemTitle > regex > question fallback.
    // The generate cron does NOT re-run the LLM for existing markets,
    // so we re-derive the best shortName from the current market data.
    // If the market has a groupItemTitle (e.g. "Viktor Orban"), use that;
    // otherwise fall back to the (possibly updated) question.
    const freshShort =
      resolveShortName(market) ?? fields.question ?? existing.question;
    if (freshShort && existing.shortName !== freshShort) {
      fields.shortName = freshShort;
      old.shortName = existing.shortName;
    }

    if (Object.keys(fields).length > 0) {
      updates.push({ conditionId: market.conditionId, fields, old });
    }
  }

  if (updates.length > 0) {
    console.log(
      `[Metadata] Found ${updates.length} conditions with stale metadata`
    );
    for (const u of updates) {
      const changed = Object.keys(u.fields).join(', ');
      console.log(
        `[Metadata]   ${u.conditionId.slice(0, 10)}... changed: ${changed}`
      );
    }
  }

  return updates;
}

export function exportJSON(
  data: SapienceOutput,
  filename: string = 'sapience-conditions.json'
): void {
  const outputPath = join(process.cwd(), filename);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Exported to ${outputPath}`);
}
