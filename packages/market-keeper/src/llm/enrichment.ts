/**
 * Market enrichment with LLM - batching, caching, and fallback logic
 */

import type { PolymarketMarket } from '../types';
import type {
  MarketEnrichmentInput,
  MarketEnrichmentOutput,
  EnrichmentResult,
  EndTimeEnrichmentInput,
} from './types';
import { inferSapienceCategorySlug } from '../generate/category';
import { inferShortName } from '../generate/shortName';
import {
  callOpenRouterForCategory,
  callOpenRouterForShortNameOnly,
  callOpenRouterForBoth,
  callOpenRouterForEndTime,
  logRegexPrepass,
  type RegexResolvedEntry,
  type SanityFailEntry,
} from './openrouter';
import { parseOutcomes } from '../generate/transform';
import { extractEndTime } from '../generate/endtime';

const ENDTIME_SANITY_CHECK_SECONDS = 14 * 86400; // 14 days

// Reduced batch size to avoid token limits with free models
const LLM_BATCH_SIZE = 10;

// In-memory cache for current run
const enrichmentCache = new Map<string, MarketEnrichmentOutput>();

export function marketToEnrichmentInput(
  market: PolymarketMarket
): MarketEnrichmentInput {
  return {
    conditionId: market.conditionId,
    question: market.question,
    description: market.description || '',
    slug: market.slug,
    eventTitle: market.events?.[0]?.title,
    outcomes: parseOutcomes(market.outcomes),
  };
}

export function getFallbackEnrichment(
  market: PolymarketMarket
): MarketEnrichmentOutput {
  const category = inferSapienceCategorySlug(market);
  return {
    conditionId: market.conditionId,
    // If deterministic category is 'unknown', fall back to 'geopolitics'
    category: category === 'unknown' ? 'geopolitics' : category,
    shortName: inferShortName(market) ?? market.question,
  };
}

export async function enrichMarkets(
  markets: PolymarketMarket[],
  apiKey: string,
  model?: string
): Promise<EnrichmentResult> {
  const results = new Map<string, MarketEnrichmentOutput>();
  const errors: string[] = [];
  let usedFallback = false;

  // Split markets into four groups:
  // 1. Markets with deterministic category AND short name -> no LLM needed
  // 2. Markets with deterministic short name but unknown category -> LLM for category only
  // 3. Markets with deterministic category but no short name -> LLM for short name only
  // 4. Markets without deterministic short name AND unknown category -> LLM for both
  const fullyDeterministic: PolymarketMarket[] = [];
  const needsCategoryOnly: PolymarketMarket[] = [];
  const needsShortNameOnly: PolymarketMarket[] = [];
  const needsBoth: PolymarketMarket[] = [];
  const deterministicData = new Map<
    string,
    { shortName: string | null; category: string }
  >();

  for (const market of markets) {
    const cached = enrichmentCache.get(market.conditionId);
    if (cached) {
      // Use cached result (with deterministic overrides if available)
      const shortName = inferShortName(market);
      const category = inferSapienceCategorySlug(market);
      results.set(market.conditionId, {
        ...cached,
        ...(shortName && { shortName }),
        ...(category !== 'unknown' && { category }),
      });
      continue;
    }

    const shortName = inferShortName(market);
    const category = inferSapienceCategorySlug(market);

    if (shortName && category !== 'unknown') {
      // Fully deterministic - no LLM needed
      deterministicData.set(market.conditionId, { shortName, category });
      fullyDeterministic.push(market);
    } else if (shortName) {
      // Has short name but unknown category - need LLM for category only
      deterministicData.set(market.conditionId, { shortName, category });
      needsCategoryOnly.push(market);
    } else if (category !== 'unknown') {
      // Has category but no short name - need LLM for short name only
      deterministicData.set(market.conditionId, { shortName: null, category });
      needsShortNameOnly.push(market);
    } else {
      // No short name pattern AND unknown category - need LLM for both
      needsBoth.push(market);
    }
  }

  console.log(
    `[LLM] Split: ${fullyDeterministic.length} fully deterministic, ${needsCategoryOnly.length} need LLM category, ${needsShortNameOnly.length} need LLM shortName, ${needsBoth.length} need LLM both`
  );

  // Process fully deterministic markets (no LLM needed)
  for (const market of fullyDeterministic) {
    const data = deterministicData.get(market.conditionId)!;
    const enriched: MarketEnrichmentOutput = {
      conditionId: market.conditionId,
      category: data.category as MarketEnrichmentOutput['category'],
      shortName: data.shortName!, // guaranteed non-null for fullyDeterministic
    };
    results.set(market.conditionId, enriched);
    enrichmentCache.set(market.conditionId, enriched);
  }

  // Process markets needing category only (LLM for category)
  if (needsCategoryOnly.length > 0) {
    const batches: PolymarketMarket[][] = [];
    for (let i = 0; i < needsCategoryOnly.length; i += LLM_BATCH_SIZE) {
      batches.push(needsCategoryOnly.slice(i, i + LLM_BATCH_SIZE));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `[LLM] Processing category batch ${batchIndex + 1}/${batches.length} (${batch.length} markets)`
      );

      try {
        const inputs = batch.map(marketToEnrichmentInput);
        const categoryOutputs = await callOpenRouterForCategory(inputs, {
          apiKey,
          model,
        });

        for (const output of categoryOutputs) {
          const data = deterministicData.get(output.conditionId)!;
          const enriched: MarketEnrichmentOutput = {
            conditionId: output.conditionId,
            category: output.category,
            shortName: data.shortName!, // guaranteed non-null for needsCategoryOnly
          };
          results.set(output.conditionId, enriched);
          enrichmentCache.set(output.conditionId, enriched);
        }

        // Fallback for missing
        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            const fallback = getFallbackEnrichment(market);
            results.set(market.conditionId, fallback);
            usedFallback = true;
            console.log(
              `[LLM] Missing in category response, using fallback for: ${market.conditionId}`
            );
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Category batch ${batchIndex + 1} failed: ${errorMsg}`);
        console.error(
          `[LLM] Category batch ${batchIndex + 1} failed, using fallback: ${errorMsg}`
        );

        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            results.set(market.conditionId, getFallbackEnrichment(market));
          }
        }
        usedFallback = true;
      }
    }
  }

  // Process markets needing short name only (LLM for short name)
  if (needsShortNameOnly.length > 0) {
    const batches: PolymarketMarket[][] = [];
    for (let i = 0; i < needsShortNameOnly.length; i += LLM_BATCH_SIZE) {
      batches.push(needsShortNameOnly.slice(i, i + LLM_BATCH_SIZE));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `[LLM] Processing shortName-only batch ${batchIndex + 1}/${batches.length} (${batch.length} markets)`
      );

      try {
        const inputs = batch.map(marketToEnrichmentInput);
        const shortNameOutputs = await callOpenRouterForShortNameOnly(inputs, {
          apiKey,
          model,
        });

        for (const output of shortNameOutputs) {
          const data = deterministicData.get(output.conditionId)!;
          const enriched: MarketEnrichmentOutput = {
            conditionId: output.conditionId,
            category: data.category as MarketEnrichmentOutput['category'],
            shortName: output.shortName,
          };
          results.set(output.conditionId, enriched);
          enrichmentCache.set(output.conditionId, enriched);
        }

        // Fallback for missing
        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            const fallback = getFallbackEnrichment(market);
            results.set(market.conditionId, fallback);
            usedFallback = true;
            console.log(
              `[LLM] Missing in shortName-only response, using fallback for: ${market.conditionId}`
            );
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(
          `ShortName-only batch ${batchIndex + 1} failed: ${errorMsg}`
        );
        console.error(
          `[LLM] ShortName-only batch ${batchIndex + 1} failed, using fallback: ${errorMsg}`
        );

        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            results.set(market.conditionId, getFallbackEnrichment(market));
          }
        }
        usedFallback = true;
      }
    }
  }

  // Process markets needing both (LLM for category + short name)
  if (needsBoth.length > 0) {
    const batches: PolymarketMarket[][] = [];
    for (let i = 0; i < needsBoth.length; i += LLM_BATCH_SIZE) {
      batches.push(needsBoth.slice(i, i + LLM_BATCH_SIZE));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(
        `[LLM] Processing both batch ${batchIndex + 1}/${batches.length} (${batch.length} markets)`
      );

      try {
        const inputs = batch.map(marketToEnrichmentInput);
        const outputs = await callOpenRouterForBoth(inputs, { apiKey, model });

        for (const output of outputs) {
          results.set(output.conditionId, output);
          enrichmentCache.set(output.conditionId, output);
        }

        // Fallback for missing
        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            const fallback = getFallbackEnrichment(market);
            results.set(market.conditionId, fallback);
            usedFallback = true;
            console.log(
              `[LLM] Missing in both response, using fallback for: ${market.conditionId}`
            );
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Both batch ${batchIndex + 1} failed: ${errorMsg}`);
        console.error(
          `[LLM] Both batch ${batchIndex + 1} failed, using fallback: ${errorMsg}`
        );

        for (const market of batch) {
          if (!results.has(market.conditionId)) {
            results.set(market.conditionId, getFallbackEnrichment(market));
          }
        }
        usedFallback = true;
      }
    }
  }

  return { results, errors, usedFallback };
}

/**
 * Main entry point - handles LLM disabled case
 */
export async function enrichMarketsWithLLM(
  markets: PolymarketMarket[],
  options: { enabled: boolean; apiKey?: string; model?: string }
): Promise<Map<string, MarketEnrichmentOutput>> {
  // If LLM disabled or no API key, use fallback for all
  if (!options.enabled || !options.apiKey) {
    const results = new Map<string, MarketEnrichmentOutput>();
    let deterministicCount = 0;
    for (const market of markets) {
      const shortName = inferShortName(market);
      if (shortName) {
        deterministicCount++;
      } else {
        console.log(`[LLM] No pattern for short name: "${market.question}"`);
      }
      results.set(market.conditionId, getFallbackEnrichment(market));
    }
    console.log(
      `[LLM] Disabled or no API key, using regex fallback for ${markets.length} markets (${deterministicCount} with deterministic short names)`
    );
    return results;
  }

  console.log(`[LLM] Enriching ${markets.length} markets via OpenRouter...`);

  const result = await enrichMarkets(markets, options.apiKey, options.model);

  if (result.usedFallback) {
    console.log(
      `[LLM] Warning: Used fallback for some markets. Errors: ${result.errors.join(', ')}`
    );
  }

  console.log(
    `[LLM] Enriched ${result.results.size} markets (${result.errors.length} errors)`
  );
  return result.results;
}

/**
 * Convert a PolymarketMarket to EndTimeEnrichmentInput
 */
export function marketToEndTimeInput(
  market: PolymarketMarket
): EndTimeEnrichmentInput {
  return {
    conditionId: market.conditionId,
    question: market.question,
    description: market.description || '',
    eventTitle: market.events?.[0]?.title,
  };
}

/**
 * Enrich markets with LLM-determined endTimes via Perplexity Sonar.
 * Groups markets by event title so conditions sharing an event use 1 Sonar call.
 * Returns a map of conditionId → endTime (unix seconds, NO buffer — caller adds buffer).
 * Missing entries mean the LLM couldn't determine an endTime (caller should fall back).
 */
export async function enrichEndTimesWithLLM(
  markets: PolymarketMarket[],
  options: { enabled: boolean; apiKey?: string; model?: string }
): Promise<Map<string, number>> {
  const endTimeMap = new Map<string, number>();

  if (markets.length === 0) {
    return endTimeMap;
  }

  // ── Regex pre-pass (tiers 0–4): resolve what we can without Sonar ─────────
  const sonarMarkets: PolymarketMarket[] = [];
  const regexResolved: RegexResolvedEntry[] = [];
  const sanityFails: SanityFailEntry[] = [];

  for (const market of markets) {
    const tierOut: { tier: string } = { tier: '6' };
    const regexTs = extractEndTime(
      market.question,
      market.description ?? '',
      tierOut
    );
    if (regexTs !== null && market.endDate) {
      const polyTs = new Date(market.endDate).getTime() / 1000;
      if (Math.abs(regexTs - polyTs) <= ENDTIME_SANITY_CHECK_SECONDS) {
        endTimeMap.set(market.conditionId, regexTs);
        regexResolved.push({
          question: market.question,
          tier: tierOut.tier,
          ts: regexTs,
        });
        continue;
      }
      sanityFails.push({
        question: market.question,
        tier: tierOut.tier,
        regexTs,
        polyTs,
      });
    }
    sonarMarkets.push(market);
  }

  logRegexPrepass({
    total: markets.length,
    resolved: regexResolved,
    sanityFails,
    sonarQuestions: sonarMarkets.map((m) => m.question),
  });

  console.log(
    `[LLM:endTime] ${markets.length - sonarMarkets.length} resolved via regex, ${sonarMarkets.length} → Sonar`
  );

  if (!options.enabled || !options.apiKey || sonarMarkets.length === 0) {
    if (!options.enabled || !options.apiKey) {
      console.log(
        `[LLM:endTime] Sonar skipped (enabled=${options.enabled}, hasKey=${!!options.apiKey})`
      );
    }
    return endTimeMap;
  }

  // Group markets by event title — conditions sharing an event get 1 Sonar call
  const eventGroups = new Map<string, PolymarketMarket[]>();
  const ungrouped: PolymarketMarket[] = [];

  for (const market of sonarMarkets) {
    const eventTitle = market.events?.[0]?.title;
    if (eventTitle) {
      const group = eventGroups.get(eventTitle) || [];
      group.push(market);
      eventGroups.set(eventTitle, group);
    } else {
      ungrouped.push(market);
    }
  }

  const totalCalls = eventGroups.size + ungrouped.length;
  console.log(
    `[LLM:endTime] Calling Sonar for ${sonarMarkets.length} markets (${eventGroups.size} event groups + ${ungrouped.length} ungrouped = ${totalCalls} calls)...`
  );

  let successCount = 0;
  let errorCount = 0;

  // 1 call per event group — all conditions in the group share the event context
  for (const [eventTitle, groupMarkets] of eventGroups) {
    try {
      const inputs = groupMarkets.map(marketToEndTimeInput);
      const outputs = await callOpenRouterForEndTime(inputs, {
        apiKey: options.apiKey,
        model: options.model,
      });

      for (const output of outputs) {
        if (output.endTime !== null) {
          endTimeMap.set(output.conditionId, output.endTime);
          successCount++;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[LLM:endTime] Failed for event "${eventTitle}" (${groupMarkets.length} markets): ${errorMsg}`
      );
      errorCount++;
    }
  }

  // 1 call per ungrouped condition
  for (const market of ungrouped) {
    try {
      const input = marketToEndTimeInput(market);
      const outputs = await callOpenRouterForEndTime([input], {
        apiKey: options.apiKey,
        model: options.model,
      });

      for (const output of outputs) {
        if (output.endTime !== null) {
          endTimeMap.set(output.conditionId, output.endTime);
          successCount++;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[LLM:endTime] Failed for "${market.question}": ${errorMsg}`
      );
      errorCount++;
    }
  }

  console.log(
    `[LLM:endTime] Sonar done: ${successCount} endTimes determined, ${errorCount} errors, ${sonarMarkets.length - successCount - errorCount} unknown`
  );

  return endTimeMap;
}
