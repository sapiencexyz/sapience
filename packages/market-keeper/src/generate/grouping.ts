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
  GroupSyncableFields,
  GroupMetadataUpdate,
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

function getNegRiskMarketId(market: PolymarketMarket): string | undefined {
  const raw =
    market.negRiskMarketId ??
    market.negRiskMarketID ??
    market.neg_risk_market_id ??
    market.events?.[0]?.negRiskMarketId ??
    market.events?.[0]?.negRiskMarketID ??
    market.events?.[0]?.neg_risk_market_id;
  if (raw === undefined || raw === null) return undefined;
  const id = String(raw).trim();
  return id.length > 0 ? id : undefined;
}

function isNegRiskMarket(market: PolymarketMarket): boolean {
  return market.negRisk === true || market.events?.[0]?.negRisk === true;
}

function computeNegRiskBucketMetadata(markets: PolymarketMarket[]): {
  negRisk: boolean;
  negRiskMarketId?: string;
} {
  if (markets.length === 0) return { negRisk: false };
  const ids = markets.map(getNegRiskMarketId);
  const firstId = ids[0];
  const sameBasket = !!firstId && ids.every((id) => id === firstId);
  const allNegRisk = markets.every(isNegRiskMarket);

  return allNegRisk && sameBasket
    ? { negRisk: true, negRiskMarketId: firstId }
    : { negRisk: false };
}

function negRiskBasketIdsByTitle(
  groups: Array<{ title: string; markets: PolymarketMarket[] }>
): Map<string, Set<string>> {
  const idsByTitle = new Map<string, Set<string>>();
  for (const group of groups) {
    for (const market of group.markets) {
      if (!isNegRiskMarket(market)) continue;
      const id = getNegRiskMarketId(market);
      if (!id) continue;
      const ids = idsByTitle.get(group.title) ?? new Set<string>();
      ids.add(id);
      idsByTitle.set(group.title, ids);
    }
  }
  return idsByTitle;
}

function conditionGroupTitleForMarket(
  title: string,
  market: PolymarketMarket,
  idsByTitle: Map<string, Set<string>>
): string {
  const id = getNegRiskMarketId(market);
  const conflictingBasketCount = idsByTitle.get(title)?.size ?? 0;
  if (isNegRiskMarket(market) && id && conflictingBasketCount > 1) {
    return `${title} (${id})`;
  }
  return title;
}

export function transformToSapienceCondition(
  market: PolymarketMarket,
  groupTitle?: string,
  enrichment?: MarketEnrichmentOutput,
  tags: string[] = [],
  endTimeOverride?: number,
  negRiskMetadata: { negRisk: boolean; negRiskMarketId?: string } = {
    negRisk: false,
  }
): SapienceCondition {
  // Transform "X vs Y" questions to "X beats Y?" for clarity
  const question = transformMatchQuestion(market);

  // shortName = full Yes/No-answerable short form; optionName = verbatim Polymarket groupItemTitle
  const shortName = enrichment?.shortName || question;
  const optionName = market.groupItemTitle?.trim() || undefined;

  const polymarketUrl = getPolymarketUrl(market);

  return {
    conditionHash: market.conditionId, // Use Polymarket's conditionId directly
    question,
    shortName,
    optionName,
    endDate: market.endDate,
    description: market.description || '',
    similarMarkets: polymarketUrl ? [polymarketUrl] : [],
    tags,
    categorySlug: enrichment?.category || inferSapienceCategorySlug(market), // Use LLM category or fallback
    chainId: CHAIN_ID,
    groupTitle,
    estimatedPrice: parseYesPrice(market.outcomePrices),
    similarMarketVolume: parseFloat(market.volume || '0') || 0,
    similarMarketImage: market.image,
    endTimeOverride,
    negRisk: negRiskMetadata.negRisk,
    negRiskMarketId: negRiskMetadata.negRiskMarketId,
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

  const negRiskBasketIds = negRiskBasketIdsByTitle(filteredGroups);

  // Transform single-market groups to SapienceConditionGroup[]
  const conditionGroups: SapienceConditionGroup[] = [];

  for (const group of newGroups) {
    const market = group.markets[0]; // Each group has exactly 1 market now
    const enrichment = enrichments.get(market.conditionId);
    const eventSlug = market.events?.[0]?.slug;
    const marketTags = eventSlug ? (eventTagMap.get(eventSlug) ?? []) : [];
    const conditionGroupTitle = conditionGroupTitleForMarket(
      group.title,
      market,
      negRiskBasketIds
    );
    const negRiskMetadata = computeNegRiskBucketMetadata(group.markets);
    const condition = transformToSapienceCondition(
      market,
      conditionGroupTitle,
      enrichment,
      marketTags,
      endTimeMap.get(market.conditionId),
      negRiskMetadata
    );

    // Use event description if available, otherwise use market's description
    const event = market.events?.[0];
    const groupDescription =
      event?.description?.split('\n')[0] ||
      market.description?.split('\n')[0] ||
      group.title;

    const groupUrl = getPolymarketUrl(market);
    conditionGroups.push({
      title: conditionGroupTitle,
      description: groupDescription,
      categorySlug: condition.categorySlug,
      similarMarkets: groupUrl ? [groupUrl] : [],
      tags: marketTags,
      negRisk: negRiskMetadata.negRisk,
      negRiskMarketId: negRiskMetadata.negRiskMarketId,
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
      endTimeMap.get(m.conditionId),
      computeNegRiskBucketMetadata([m])
    );
  });

  // Enforce category uniformity within each event-title bucket. The DB's
  // ConditionGroup is keyed by name (find-or-create), so multiple keeper
  // groups sharing a title collapse onto a single row server-side. Without
  // this pass, sibling conditions can carry per-market LLM categories that
  // disagree with each other AND with the group's stored category (which
  // gets stamped by whichever sibling submits first). Vote once per title
  // and rewrite both the group payload and every condition under it.
  const titleBuckets = new Map<string, SapienceConditionGroup[]>();
  for (const group of conditionGroups) {
    const bucket = titleBuckets.get(group.title) ?? [];
    bucket.push(group);
    titleBuckets.set(group.title, bucket);
  }
  for (const bucket of titleBuckets.values()) {
    const allConditions = bucket.flatMap((g) => g.conditions);
    if (allConditions.length === 0) continue;
    const voted = computeGroupCategory(allConditions);
    for (const g of bucket) {
      g.categorySlug = voted;
      for (const c of g.conditions) c.categorySlug = voted;
    }
  }

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
  };
}

/**
 * Compute fresh Polymarket-owned metadata for a market, matching the shape
 * of the fields that transformToSapienceCondition writes on initial create.
 * Kept as a single source of truth so the diff and the create paths agree.
 */
export function freshMetadataFor(
  market: PolymarketMarket,
  groupTitle: string | undefined,
  tags: string[]
): SyncableFields {
  const polymarketUrl = getPolymarketUrl(market);
  return {
    question: transformMatchQuestion(market),
    optionName: market.groupItemTitle?.trim() || undefined,
    description: market.description || '',
    // undefined (not []) so computeMetadataUpdates treats it as "we don't
    // own a fresh value" and leaves the existing DB value alone rather
    // than emitting an update that clears the field.
    similarMarkets: polymarketUrl ? [polymarketUrl] : undefined,
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
export function fieldsEqual(a: unknown, b: unknown): boolean {
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
export function computeMetadataUpdates(
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
    const negRiskMetadata = computeNegRiskBucketMetadata([market]);
    fresh.negRisk = negRiskMetadata.negRisk;
    fresh.negRiskMarketId = negRiskMetadata.negRiskMarketId ?? null;

    const fields: SyncableFields = {};
    const old: SyncableFields = {};

    // Iterate every syncable key. Undefined/null on the fresh side means
    // "we don't own this value right now" → skip, never blank out DB state.
    const keys: (keyof SyncableFields)[] = [
      'question',
      'optionName',
      'description',
      'similarMarkets',
      'tags',
      'similarMarketVolume',
      'similarMarketImage',
      'groupName',
      'negRisk',
      'negRiskMarketId',
    ];
    for (const key of keys) {
      const newVal = fresh[key];
      if (newVal === undefined) continue;
      if (newVal === null && key !== 'negRiskMarketId') continue;
      const oldVal = existing[key];
      if (!fieldsEqual(oldVal, newVal)) {
        // Dynamic assignment — `fields` and `old` share the SyncableFields
        // shape so key-by-key writes are type-safe but TS can't narrow it.
        (fields as Record<string, unknown>)[key] = newVal;
        (old as Record<string, unknown>)[key] = oldVal;
      }
    }

    // Only rewrite shortName when deterministic regex produces a non-null
    // result. Never fall back to question — that would overwrite nice
    // LLM-generated shortNames with the full question on every drift.
    const regexShort = resolveShortName(market);
    if (regexShort && existing.shortName !== regexShort) {
      fields.shortName = regexShort;
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

/**
 * Compare stored ConditionGroup.similarMarkets against what we'd generate
 * fresh from Polymarket and emit an update for any group whose URL has
 * drifted (event slug rename, earlier broken format, etc.). Each filtered
 * group is processed once; we key by the existing conditionGroupId looked
 * up via the group's first market, so we can't double-emit even if future
 * changes allow multi-market groups.
 */
export function computeGroupMetadataUpdates(
  groups: Array<{
    title: string;
    markets: PolymarketMarket[];
    eventSlug?: string;
  }>,
  existingIds: Map<string, ExistingCondition>
): GroupMetadataUpdate[] {
  const updates: GroupMetadataUpdate[] = [];
  const seenGroupIds = new Set<number>();
  for (const group of groups) {
    const market = group.markets[0];
    if (!market) continue;

    const existing = existingIds.get(market.conditionId);
    if (!existing?.conditionGroupId) continue;
    if (seenGroupIds.has(existing.conditionGroupId)) continue;
    seenGroupIds.add(existing.conditionGroupId);

    // If we can't build a correct fresh URL (market lacks an event slug),
    // skip rather than clear the existing value — matches the backfill's
    // "never overwrite with worse data" stance.
    const freshUrl = getPolymarketUrl(market);
    if (!freshUrl) continue;

    const freshSimilarMarkets = [freshUrl];
    const oldSimilarMarkets = existing.conditionGroupSimilarMarkets;
    const freshNegRisk = computeNegRiskBucketMetadata(group.markets);

    const fields: GroupSyncableFields = {};
    const old: GroupSyncableFields = {};

    if (!fieldsEqual(oldSimilarMarkets, freshSimilarMarkets)) {
      fields.similarMarkets = freshSimilarMarkets;
      old.similarMarkets = oldSimilarMarkets;
    }

    if (existing.conditionGroupNegRisk !== freshNegRisk.negRisk) {
      fields.negRisk = freshNegRisk.negRisk;
      old.negRisk = existing.conditionGroupNegRisk;
    }

    const freshNegRiskMarketId = freshNegRisk.negRisk
      ? freshNegRisk.negRiskMarketId
      : null;
    if (existing.conditionGroupNegRiskMarketId !== freshNegRiskMarketId) {
      fields.negRiskMarketId = freshNegRiskMarketId ?? null;
      old.negRiskMarketId = existing.conditionGroupNegRiskMarketId ?? null;
    }

    if (Object.keys(fields).length > 0) {
      updates.push({
        groupId: existing.conditionGroupId,
        fields,
        old,
      });
    }
  }

  if (updates.length > 0) {
    console.log(
      `[Metadata] Found ${updates.length} condition groups with stale metadata`
    );
    for (const u of updates) {
      const changed = Object.keys(u.fields).join(', ');
      console.log(`[Metadata]   group ${u.groupId} changed: ${changed}`);
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
