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
  LlmEndTimeResult,
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
import { extractEndTime } from './endtime';
import { extractCategoryEndTime } from './extractors';
import { isTemplatedMarket } from './templated';
import {
  enrichMarketsWithLLM,
  enrichEndTimesWithLLM,
  resolveShortName,
  type MarketEnrichmentOutput,
} from '../llm';
import { fetchEventTags } from './tags';
import { parseYesPrice } from '../utils/price';
import { gameEndTime, SPORT_LEAGUES } from './extractors/sports/game';
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
  // Treat any neg-risk basket id as a strong signal too: Polymarket has shipped
  // the flag and the id under slightly different field names over time, and we
  // do not want a casing mismatch to silently downgrade a basket to non-negRisk.
  return (
    market.negRisk === true ||
    market.events?.[0]?.negRisk === true ||
    getNegRiskMarketId(market) !== undefined
  );
}

/**
 * Resolve the shared Polymarket negative-risk basket id for a set of
 * sibling markets. We only stamp a basket id when every market agrees:
 * mixed groups stay basket-less so the API derives `negRisk: false`.
 */
function sharedNegRiskMarketId(
  markets: PolymarketMarket[]
): string | undefined {
  if (markets.length === 0) return undefined;
  const ids = markets.map(getNegRiskMarketId);
  const firstId = ids[0];
  const sameBasket = !!firstId && ids.every((id) => id === firstId);
  const allNegRisk = markets.every(isNegRiskMarket);
  return allNegRisk && sameBasket ? firstId : undefined;
}

/**
 * Deterministic category-specialist endTime for a market (unix seconds) or
 * null. Reads the resolution time straight out of the title/description for the
 * templated families (weather/crypto/sports/social/snapshot). When non-null it
 * becomes the condition's endTime (top of decideEndTime's cascade) AND lets the
 * market skip the Sonar endTime call. Tag routing uses the non-LLM inferred
 * category since this runs before LLM enrichment.
 */
export function categoryEndTimeForMarket(
  market: PolymarketMarket
): number | null {
  const question = transformMatchQuestion(market);
  return extractCategoryEndTime(
    question,
    market.description ?? '',
    inferSapienceCategorySlug(market)
  );
}

function normalizeLeagueCandidate(value: string | undefined | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-');
}

export function leagueForMarket(market: PolymarketMarket): string | undefined {
  const rawCandidates = [
    market.events?.[0]?.seriesSlug,
    market.events?.[0]?.series?.[0]?.slug,
    market.events?.[0]?.series?.[0]?.title,
    ...(market.events?.[0]?.tags ?? []).flatMap((tag) => [tag.slug, tag.label]),
    market.slug,
    market.events?.[0]?.slug,
    market.events?.[0]?.title,
    market.question,
  ];

  const haystack = rawCandidates
    .map(normalizeLeagueCandidate)
    .filter(Boolean)
    .join(' ');
  if (!haystack) return undefined;

  return SPORT_LEAGUES.find((league) => {
    const normalizedLeague = normalizeLeagueCandidate(league);
    return new RegExp(`(^|[^a-z0-9])${normalizedLeague}([^a-z0-9]|$)`).test(
      haystack
    );
  });
}

export function gameEndTimeForMarket(market: PolymarketMarket): number | null {
  return gameEndTime(market.gameStartTime, leagueForMarket(market));
}

function deterministicEndTimeForMarket(
  market: PolymarketMarket
): number | null {
  return gameEndTimeForMarket(market) ?? categoryEndTimeForMarket(market);
}

export function transformToSapienceCondition(
  market: PolymarketMarket,
  groupTitle?: string,
  enrichment?: MarketEnrichmentOutput,
  tags: string[] = [],
  llmEndTime?: LlmEndTimeResult,
  negRiskMarketId?: string,
  externalEventId?: string
): SapienceCondition {
  // Transform "X vs Y" questions to "X beats Y?" for clarity
  const question = transformMatchQuestion(market);

  // shortName = full Yes/No-answerable short form; optionName = verbatim Polymarket groupItemTitle
  const shortName = enrichment?.shortName || question;
  const optionName = market.groupItemTitle?.trim() || undefined;

  const polymarketUrl = getPolymarketUrl(market);

  // Regex extraction is decideEndTime's fallback for templated markets when
  // Sonar returns UNKNOWN. Always compute it; the combiner decides whether to use it.
  const regexEndTime = extractEndTime(question, market.description ?? '');

  // High-precision category specialist — second rung of decideEndTime's
  // cascade, after gameStartTime, and one signal that gates this market out of
  // the Sonar call upstream.
  const categoryEndTime = extractCategoryEndTime(
    question,
    market.description ?? '',
    inferSapienceCategorySlug(market)
  );
  const league = leagueForMarket(market);

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
    externalEventId,
    estimatedPrice: parseYesPrice(market.outcomePrices),
    similarMarketVolume: parseFloat(market.volume || '0') || 0,
    similarMarketImage: market.image,
    endTimeOverride: regexEndTime ?? undefined,
    categoryEndTime: categoryEndTime ?? undefined,
    llmEndTime,
    gameStartTime: market.gameStartTime ?? undefined,
    league,
    isTemplated: isTemplatedMarket(market),
    negRisk: negRiskMarketId !== undefined,
    negRiskMarketId,
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
        eventId: event.id,
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

  // Cascade gate: markets a deterministic rung (gameStartTime or category
  // specialist: weather/crypto/sports/social/snapshot) can resolve skip the
  // Sonar endTime call entirely — that's where the LLM cost is saved. Sonar
  // still runs for every market the deterministic rungs decline.
  // (category/shortName enrichment is unaffected and runs on all new markets.)
  const sonarEndTimeMarkets = newMarkets.filter(
    (m) => deterministicEndTimeForMarket(m) == null
  );
  const gatedCount = newMarkets.length - sonarEndTimeMarkets.length;
  if (gatedCount > 0) {
    console.log(
      `[LLM:endTime] cascade gate: ${gatedCount}/${newMarkets.length} markets ` +
        `resolved by deterministic rungs — skipping Sonar for those`
    );
  }

  // Enrich NEW markets with LLM — category/shortName and endTime run in parallel
  const [enrichments, endTimeMap] = await Promise.all([
    enrichMarketsWithLLM(newMarkets, {
      enabled: LLM_ENRICHMENT_ENABLED,
      apiKey: OPENROUTER_API_KEY,
      model: LLM_MODEL,
    }),
    enrichEndTimesWithLLM(sonarEndTimeMarkets, {
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
    // Use the raw event title — no basket-id suffixing. If two same-title
    // markets come from different baskets, the API's strict basket
    // invariant rejects whichever one arrives second, surfaced as an
    // operator-visible 400 from batch-create. Auto-segmenting masked the
    // underlying data problem; let it surface.
    const conditionGroupTitle = group.title;
    const groupNegRiskMarketId = sharedNegRiskMarketId(group.markets);
    // Use the (pre-injected) eventId on MarketGroup when present, falling
    // back to the market's events[0].id. Both should agree.
    const groupExternalEventId =
      group.eventId ?? market.events?.[0]?.id ?? undefined;
    const condition = transformToSapienceCondition(
      market,
      conditionGroupTitle,
      enrichment,
      marketTags,
      endTimeMap.get(market.conditionId),
      groupNegRiskMarketId,
      groupExternalEventId
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
      negRiskMarketId: groupNegRiskMarketId,
      externalEventId: groupExternalEventId,
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
      sharedNegRiskMarketId([m]),
      m.events?.[0]?.id ?? undefined
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
    externalEventId: market.events?.[0]?.id ?? undefined,
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

    const fields: SyncableFields = {};
    const old: SyncableFields = {};

    // Iterate every syncable key. Undefined/null on the fresh side means
    // "we don't own this value right now" → skip, never blank out DB state.
    // Per-condition negRisk fields are not GraphQL-exposed, so the keeper
    // does not drift-detect them here — only the ConditionGroup.negRisk
    // bucket flag is tracked, in computeGroupMetadataUpdates below.
    //
    // externalEventId is included so the admin route can re-resolve the
    // group via the canonical (source, externalEventId) lookup. Without it,
    // batch-metadata payloads would carry only groupName, which is no
    // longer unique after migration 20260529001202 dropped UNIQUE(name) —
    // and the route's name-fallback could attach the condition to the
    // wrong group when multiple groups share a display title.
    const keys: (keyof SyncableFields)[] = [
      'question',
      'optionName',
      'description',
      'similarMarkets',
      'tags',
      'similarMarketVolume',
      'similarMarketImage',
      'groupName',
      'externalEventId',
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

    // When the diff emits groupName but not externalEventId, force the
    // event id into the payload anyway. Reason: the admin route's
    // group-resolution precedence is (source, externalEventId) → name
    // fallback. If we send only groupName for a group-rename
    // (e.g. Polymarket changes the event title but keeps the same id),
    // the route hits the name fallback — and with UNIQUE(name) dropped
    // by migration 20260529001202, that can attach the condition to a
    // different newest-id-wins row sharing the title. Carrying
    // externalEventId — even unchanged — keeps the lookup on the
    // canonical event-keyed path.
    if (
      Object.prototype.hasOwnProperty.call(fields, 'groupName') &&
      !Object.prototype.hasOwnProperty.call(fields, 'externalEventId') &&
      typeof fresh.externalEventId === 'string' &&
      fresh.externalEventId.length > 0
    ) {
      (fields as Record<string, unknown>).externalEventId =
        fresh.externalEventId;
      (old as Record<string, unknown>).externalEventId =
        existing.externalEventId;
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
 * drifted (event slug rename, earlier broken format, etc.).
 *
 * Fresh markets are first aggregated by the existing Sapience
 * `conditionGroupId` they map to, so `sharedNegRiskMarketId` evaluates the
 * **full sibling set** instead of one market in isolation. Without this,
 * refresh-metadata's one-market-per-synthetic-group input would let any
 * single sibling unilaterally stamp the whole group's basket id, even
 * when other siblings disagree.
 */
export function computeGroupMetadataUpdates(
  groups: Array<{
    title: string;
    markets: PolymarketMarket[];
    eventSlug?: string;
  }>,
  existingIds: Map<string, ExistingCondition>
): GroupMetadataUpdate[] {
  // Aggregate fresh markets by the Sapience conditionGroupId they belong
  // to. A single synthetic input group has at most one market, so we
  // collapse across synthetic groups here.
  type AggregatedGroup = {
    sapienceGroupId: number;
    sapienceGroupNegRisk: boolean;
    sapienceGroupSimilarMarkets: string[] | undefined;
    title: string;
    markets: PolymarketMarket[];
  };
  const aggregated = new Map<number, AggregatedGroup>();
  for (const group of groups) {
    for (const market of group.markets) {
      const existing = existingIds.get(market.conditionId);
      if (!existing?.conditionGroupId) continue;
      const bucket = aggregated.get(existing.conditionGroupId);
      if (bucket) {
        bucket.markets.push(market);
      } else {
        aggregated.set(existing.conditionGroupId, {
          sapienceGroupId: existing.conditionGroupId,
          sapienceGroupNegRisk: existing.conditionGroupNegRisk ?? false,
          sapienceGroupSimilarMarkets: existing.conditionGroupSimilarMarkets,
          title: group.title,
          markets: [market],
        });
      }
    }
  }

  const updates: GroupMetadataUpdate[] = [];
  for (const bucket of aggregated.values()) {
    // Use the first market only to derive the URL — every Polymarket
    // sibling under the same event resolves to the same canonical
    // event URL, so picking one is fine and matches the prior behaviour.
    const firstMarket = bucket.markets[0];
    if (!firstMarket) continue;

    // If we can't build a correct fresh URL (market lacks an event slug),
    // skip rather than clear the existing value — matches the backfill's
    // "never overwrite with worse data" stance.
    const freshUrl = getPolymarketUrl(firstMarket);
    if (!freshUrl) continue;

    const freshSimilarMarkets = [freshUrl];
    const oldSimilarMarkets = bucket.sapienceGroupSimilarMarkets;
    // Now evaluated across the *full* sibling set, not a single market.
    const freshNegRiskMarketId = sharedNegRiskMarketId(bucket.markets);

    const fields: GroupSyncableFields = {};
    const old: GroupSyncableFields = {};

    if (!fieldsEqual(oldSimilarMarkets, freshSimilarMarkets)) {
      fields.similarMarkets = freshSimilarMarkets;
      old.similarMarkets = oldSimilarMarkets;
    }

    // negRisk on an existing group is a one-way ratchet: we only ever flip
    // false → true. A demotion back to non-negRisk would silently dissolve a
    // basket's invariant — if fresh markets disagree on basketing, that's a
    // data problem to surface to operators, not auto-correct. The boolean
    // itself lives in GraphQL as a derived field; the keeper writes
    // `negRiskMarketId` directly via PUT /admin/conditionGroups/:id and the
    // API computes the boolean from it being non-null.
    if (
      bucket.sapienceGroupNegRisk === false &&
      freshNegRiskMarketId !== undefined
    ) {
      fields.negRiskMarketId = freshNegRiskMarketId;
      old.negRiskMarketId = null;
    } else if (
      bucket.sapienceGroupNegRisk === true &&
      freshNegRiskMarketId === undefined
    ) {
      console.error(
        `[Metadata] refused to demote group ${bucket.sapienceGroupId} ` +
          `("${bucket.title}") from negRisk: fresh Polymarket markets disagree on ` +
          `basket id (or are missing it). Conditions: ` +
          bucket.markets
            .map((m) => `${m.conditionId}=${getNegRiskMarketId(m) ?? 'none'}`)
            .join(', ')
      );
    }

    if (Object.keys(fields).length > 0) {
      updates.push({
        groupId: bucket.sapienceGroupId,
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
