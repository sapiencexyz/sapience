/**
 * OpenRouter API client
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchWithRetry } from '../utils';
import type { SapienceCategorySlug } from '../types';
import { LLM_ENDTIME_TIMEOUT_MS } from '../constants';
import type {
  MarketEnrichmentInput,
  MarketEnrichmentOutput,
  CategoryOutput,
  ShortNameOnlyOutput,
  EndTimeEnrichmentInput,
  EndTimeOutput,
  EndTimeConfidence,
} from './types';
import {
  buildCategoryPrompt,
  buildShortNameOnlyPrompt,
  buildBothPrompt,
  buildEndTimePrompt,
  CATEGORY_SYSTEM_PROMPT,
  SHORTNAME_ONLY_SYSTEM_PROMPT,
  BOTH_SYSTEM_PROMPT,
  ENDTIME_SYSTEM_PROMPT,
  VALID_CATEGORIES,
} from './prompts';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
// 30 seconds timeout
const TIMEOUT_MS = 30000;

// Log file for LLM responses (only in non-production)
const LLM_RESPONSE_LOG_FILE = path.join(process.cwd(), 'llm-markets.log');

// Track if we've initialized the log file this run
let logFileInitialized = false;

interface OpenRouterConfig {
  apiKey: string;
  model?: string;
}

interface LLMLogOptions {
  model: string;
  prompt: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finishReason?: string;
  citations?: string[];
  parsedResults?: Array<{
    question: string;
    raw: string;
    parsed: string;
    status: 'ok' | 'unknown' | 'rejected-past' | 'missing';
  }>;
}

/**
 * Log LLM request and response to file (non-production only)
 * Recreates the log file on first call of each run
 */
function logLLMResponse(
  type: 'category' | 'shortName' | 'both' | 'endTime',
  markets: (MarketEnrichmentInput | EndTimeEnrichmentInput)[],
  response: string,
  opts: LLMLogOptions
): void {
  // Skip logging in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const timestamp = new Date().toISOString();

  const usageLine = opts.usage
    ? `${opts.usage.prompt_tokens} prompt + ${opts.usage.completion_tokens} completion = ${opts.usage.total_tokens} total tokens`
    : 'N/A';

  const citationsSection = opts.citations?.length
    ? `\nCitations:\n${opts.citations.map((c) => `  - ${c}`).join('\n')}`
    : '';

  const parsedSection = opts.parsedResults?.length
    ? `\nParsed results:\n${opts.parsedResults
        .map(
          (r) =>
            `  [${r.status.toUpperCase().padEnd(12)}] "${r.question.slice(0, 60)}" -> ${r.raw} => ${r.parsed}`
        )
        .join('\n')}`
    : '';

  const logEntry = `=== ${timestamp} | ${type.toUpperCase()} | model: ${opts.model} | ${markets.length} markets | tokens: ${usageLine} | finish: ${opts.finishReason ?? '?'} ===

--- PROMPT ---
${opts.prompt}

--- RAW RESPONSE ---
${response}
${citationsSection}${parsedSection}

===

`;

  // On first call, recreate the file (overwrite); otherwise append
  if (!logFileInitialized) {
    fs.writeFileSync(LLM_RESPONSE_LOG_FILE, logEntry);
    logFileInitialized = true;
  } else {
    fs.appendFileSync(LLM_RESPONSE_LOG_FILE, logEntry);
  }
}

/**
 * Call OpenRouter for category-only enrichment
 */
export async function callOpenRouterForCategory(
  markets: MarketEnrichmentInput[],
  config: OpenRouterConfig
): Promise<CategoryOutput[]> {
  const prompt = buildCategoryPrompt(markets);
  const model = config.model || DEFAULT_MODEL;

  console.log(`[LLM] Calling OpenRouter (category only) with model: ${model}`);
  console.log(
    `[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`
  );

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'market-keeper',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: CATEGORY_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 10000,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
    3,
    1000
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[LLM] API error: ${response.status} - ${error}`);
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const finishReason = data.choices?.[0]?.finish_reason;

  // Log usage stats if available
  if (data.usage) {
    console.log(
      `[LLM] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`
    );
  }

  // Check for truncation
  if (finishReason === 'length') {
    console.warn(
      `[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`
    );
  }

  console.log(
    `[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`
  );

  const results = parseCategoryResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} category results`);

  const parsedCatSet = new Map(results.map((r) => [r.conditionId, r.category]));
  logLLMResponse('category', markets, content, {
    model,
    prompt,
    usage: data.usage,
    finishReason,
    parsedResults: markets.map((m) => ({
      question: m.question,
      raw: '',
      parsed: parsedCatSet.get(m.conditionId) ?? 'N/A',
      status: parsedCatSet.has(m.conditionId) ? 'ok' : 'missing',
    })),
  });

  return results;
}

/**
 * Call OpenRouter for short-name-only enrichment (when category is already determined)
 */
export async function callOpenRouterForShortNameOnly(
  markets: MarketEnrichmentInput[],
  config: OpenRouterConfig
): Promise<ShortNameOnlyOutput[]> {
  const prompt = buildShortNameOnlyPrompt(markets);
  const model = config.model || DEFAULT_MODEL;

  console.log(`[LLM] Calling OpenRouter (shortName only) with model: ${model}`);
  console.log(
    `[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`
  );

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'market-keeper',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SHORTNAME_ONLY_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 10000,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
    3,
    1000
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[LLM] API error: ${response.status} - ${error}`);
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const finishReason = data.choices?.[0]?.finish_reason;

  // Log usage stats if available
  if (data.usage) {
    console.log(
      `[LLM] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`
    );
  }

  // Check for truncation
  if (finishReason === 'length') {
    console.warn(
      `[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`
    );
  }

  console.log(
    `[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`
  );

  const results = parseShortNameOnlyResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} shortName results`);

  const parsedNameSet = new Map(
    results.map((r) => [r.conditionId, r.shortName])
  );
  logLLMResponse('shortName', markets, content, {
    model,
    prompt,
    usage: data.usage,
    finishReason,
    parsedResults: markets.map((m) => ({
      question: m.question,
      raw: '',
      parsed: parsedNameSet.get(m.conditionId) ?? 'N/A',
      status: parsedNameSet.has(m.conditionId) ? 'ok' : 'missing',
    })),
  });

  return results;
}

/**
 * Call OpenRouter for full enrichment (category + short name)
 */
export async function callOpenRouterForBoth(
  markets: MarketEnrichmentInput[],
  config: OpenRouterConfig
): Promise<MarketEnrichmentOutput[]> {
  const prompt = buildBothPrompt(markets);
  const model = config.model || DEFAULT_MODEL;

  console.log(
    `[LLM] Calling OpenRouter (category + shortName) with model: ${model}`
  );
  console.log(
    `[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`
  );

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'market-keeper',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: BOTH_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 10000,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
    3,
    1000
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[LLM] API error: ${response.status} - ${error}`);
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const finishReason = data.choices?.[0]?.finish_reason;

  // Log usage stats if available
  if (data.usage) {
    console.log(
      `[LLM] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`
    );
  }

  // Check for truncation
  if (finishReason === 'length') {
    console.warn(
      `[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`
    );
  }

  console.log(
    `[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`
  );

  const results = parseBothResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} results`);

  const parsedBothSet = new Map(results.map((r) => [r.conditionId, r]));
  logLLMResponse('both', markets, content, {
    model,
    prompt,
    usage: data.usage,
    finishReason,
    parsedResults: markets.map((m) => {
      const r = parsedBothSet.get(m.conditionId);
      return {
        question: m.question,
        raw: '',
        parsed: r ? `${r.category} | ${r.shortName}` : 'N/A',
        status: r ? 'ok' : 'missing',
      };
    }),
  });

  return results;
}

/**
 * Ensure shortName ends with a question mark
 */
function ensureQuestionMark(shortName: string): string {
  const trimmed = shortName.trim();
  return trimmed.endsWith('?') ? trimmed : `${trimmed}?`;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find the closest matching conditionId using Levenshtein distance
 * Returns the matched id if distance < 5, otherwise null
 */
function findClosestConditionId(id: string, validIds: string[]): string | null {
  let bestMatch: string | null = null;
  let bestDistance = 5; // threshold

  for (const validId of validIds) {
    const distance = levenshteinDistance(id, validId);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = validId;
    }
  }

  if (bestMatch) {
    console.log(
      `[LLM] Fuzzy matched "${id.slice(0, 15)}..." to "${bestMatch.slice(0, 15)}..." (distance: ${bestDistance})`
    );
  }

  return bestMatch;
}

// Regex to match a hex condition ID (0x + 64 hex chars) at the start of a line
const CONDITION_ID_RE = /^(0x[a-fA-F0-9]{64})/;

/**
 * Split a line into condition ID + remaining content.
 * Tries comma-separated first, then falls back to space-separated
 * using the known hex ID format.
 */
function splitIdFromRest(line: string): { id: string; rest: string } | null {
  const firstComma = line.indexOf(',');
  if (firstComma !== -1) {
    return {
      id: line.slice(0, firstComma).trim(),
      rest: line.slice(firstComma + 1).trim(),
    };
  }

  // Fallback: match hex condition ID followed by whitespace
  const match = line.match(CONDITION_ID_RE);
  if (match) {
    const rest = line.slice(match[1].length).trim();
    if (rest.length > 0) {
      return { id: match[1], rest };
    }
  }

  return null;
}

/**
 * Parse category-only response (id,category)
 */
function parseCategoryResponse(
  content: string,
  markets: MarketEnrichmentInput[]
): CategoryOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: CategoryOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines with their categories
  const parsedLines: Array<{ id: string; cat: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (
      line.startsWith('```') ||
      line.startsWith('id,') ||
      line.startsWith('<')
    ) {
      continue;
    }

    // Parse id,category (CSV or space-separated fallback)
    const parsed = splitIdFromRest(line);
    if (!parsed) {
      console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      continue;
    }

    parsedLines.push({ id: parsed.id, cat: parsed.rest });
  }

  // Second pass: match exact IDs
  for (const { id, cat } of parsedLines) {
    if (!marketMap.has(id)) {
      continue;
    }

    const market = marketMap.get(id)!;
    const category = VALID_CATEGORIES.includes(cat as SapienceCategorySlug)
      ? (cat as SapienceCategorySlug)
      : 'geopolitics';

    console.log(
      `[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}`
    );

    results.push({
      conditionId: id,
      category,
    });
    foundIds.add(id);
  }

  // Third pass: fuzzy match unmatched IDs
  const unmatchedIds = parsedLines.filter(({ id }) => !marketMap.has(id));
  const missingMarketIds = validIds.filter((id) => !foundIds.has(id));

  for (const { id, cat } of unmatchedIds) {
    const matchedId = findClosestConditionId(id, missingMarketIds);
    if (matchedId && !foundIds.has(matchedId)) {
      const market = marketMap.get(matchedId)!;
      const category = VALID_CATEGORIES.includes(cat as SapienceCategorySlug)
        ? (cat as SapienceCategorySlug)
        : 'geopolitics';

      console.log(
        `[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category} (fuzzy)`
      );

      results.push({
        conditionId: matchedId,
        category,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets
    .filter((m) => !foundIds.has(m.conditionId))
    .map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(
      `[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`
    );
  }

  return results;
}

/**
 * Parse short-name-only response (id,shortName)
 */
function parseShortNameOnlyResponse(
  content: string,
  markets: MarketEnrichmentInput[]
): ShortNameOnlyOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: ShortNameOnlyOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines
  const parsedLines: Array<{ id: string; name: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (
      line.startsWith('```') ||
      line.startsWith('id,') ||
      line.startsWith('<')
    ) {
      continue;
    }

    // Parse id,shortName (CSV or space-separated fallback)
    const parsed = splitIdFromRest(line);
    if (!parsed) {
      console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      continue;
    }

    parsedLines.push({ id: parsed.id, name: parsed.rest });
  }

  // Second pass: match exact IDs
  for (const { id, name } of parsedLines) {
    if (!marketMap.has(id)) {
      continue;
    }

    const market = marketMap.get(id)!;
    const shortName = ensureQuestionMark(name || market.question);

    console.log(
      `[LLM]   "${market.question.slice(0, 50)}..." -> name: "${shortName}"`
    );

    results.push({
      conditionId: id,
      shortName,
    });
    foundIds.add(id);
  }

  // Third pass: fuzzy match unmatched IDs
  const unmatchedIds = parsedLines.filter(({ id }) => !marketMap.has(id));
  const missingMarketIds = validIds.filter((id) => !foundIds.has(id));

  for (const { id, name } of unmatchedIds) {
    const matchedId = findClosestConditionId(id, missingMarketIds);
    if (matchedId && !foundIds.has(matchedId)) {
      const market = marketMap.get(matchedId)!;
      const shortName = ensureQuestionMark(name || market.question);

      console.log(
        `[LLM]   "${market.question.slice(0, 50)}..." -> name: "${shortName}" (fuzzy)`
      );

      results.push({
        conditionId: matchedId,
        shortName,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets
    .filter((m) => !foundIds.has(m.conditionId))
    .map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(
      `[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`
    );
  }

  return results;
}

/**
 * Parse full response (id,category,shortName)
 */
function parseBothResponse(
  content: string,
  markets: MarketEnrichmentInput[]
): MarketEnrichmentOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: MarketEnrichmentOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines
  const parsedLines: Array<{ id: string; cat: string; name: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (
      line.startsWith('```') ||
      line.startsWith('id,') ||
      line.startsWith('<')
    ) {
      continue;
    }

    // Parse id,category,shortName (CSV or space-separated fallback)
    const firstComma = line.indexOf(',');
    const secondComma =
      firstComma !== -1 ? line.indexOf(',', firstComma + 1) : -1;

    if (firstComma !== -1 && secondComma !== -1) {
      // Standard CSV: id,category,shortName
      const id = line.slice(0, firstComma).trim();
      const cat = line.slice(firstComma + 1, secondComma).trim();
      const name = line.slice(secondComma + 1).trim();
      parsedLines.push({ id, cat, name });
    } else {
      // Fallback: space-separated — id category rest-is-shortName
      const match = line.match(CONDITION_ID_RE);
      if (match) {
        const rest = line.slice(match[1].length).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx !== -1) {
          const cat = rest.slice(0, spaceIdx).trim();
          const name = rest.slice(spaceIdx + 1).trim();
          parsedLines.push({ id: match[1], cat, name });
        } else {
          console.warn(
            `[LLM] Skipping malformed line: ${line.slice(0, 50)}...`
          );
        }
      } else {
        console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      }
    }
  }

  // Second pass: match exact IDs
  for (const { id, cat, name } of parsedLines) {
    if (!marketMap.has(id)) {
      continue;
    }

    const market = marketMap.get(id)!;
    const category = VALID_CATEGORIES.includes(cat as SapienceCategorySlug)
      ? (cat as SapienceCategorySlug)
      : 'geopolitics';

    const shortName = ensureQuestionMark(name || market.question);

    console.log(
      `[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}, name: "${shortName}"`
    );

    results.push({
      conditionId: id,
      category,
      shortName,
    });
    foundIds.add(id);
  }

  // Third pass: fuzzy match unmatched IDs
  const unmatchedIds = parsedLines.filter(({ id }) => !marketMap.has(id));
  const missingMarketIds = validIds.filter((id) => !foundIds.has(id));

  for (const { id, cat, name } of unmatchedIds) {
    const matchedId = findClosestConditionId(id, missingMarketIds);
    if (matchedId && !foundIds.has(matchedId)) {
      const market = marketMap.get(matchedId)!;
      const category = VALID_CATEGORIES.includes(cat as SapienceCategorySlug)
        ? (cat as SapienceCategorySlug)
        : 'geopolitics';

      const shortName = ensureQuestionMark(name || market.question);

      console.log(
        `[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}, name: "${shortName}" (fuzzy)`
      );

      results.push({
        conditionId: matchedId,
        category,
        shortName,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets
    .filter((m) => !foundIds.has(m.conditionId))
    .map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(
      `[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`
    );
  }

  return results;
}

/**
 * Parse endTime response. New format is a JSON array:
 *   [{ id, ts: ISO8601 | null, confidence: "high"|"low"|"unknown" }]
 *
 * Legacy CSV format (id,ISO8601_or_UNKNOWN) is still accepted as fallback for
 * resilience against the model regressing to the old shape — every CSV line
 * gets a synthetic confidence: 'low' when ts is present, 'unknown' when not.
 */
export function parseEndTimeResponse(
  content: string,
  markets: EndTimeEnrichmentInput[]
): EndTimeOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: EndTimeOutput[] = [];
  const foundIds = new Set<string>();
  const now = Math.floor(Date.now() / 1000);

  // First pass: collect parsed entries — try JSON array first, fall back to CSV.
  const parsedEntries: Array<{
    id: string;
    dateStr: string;
    rawConfidence: string | null;
  }> = [];

  const jsonEntries = tryParseJsonArray(content);
  if (jsonEntries) {
    parsedEntries.push(...jsonEntries);
  } else {
    parsedEntries.push(...parseCsvFallback(content));
  }

  // Second pass: exact ID matches
  for (const { id, dateStr, rawConfidence } of parsedEntries) {
    if (!marketMap.has(id)) continue;

    const endTime = parseEndTimeValue(dateStr, now);
    const confidence = normalizeConfidence(rawConfidence, endTime);
    console.log(
      `[LLM:endTime]   "${marketMap.get(id)!.question}" -> ${dateStr} (${endTime === null ? 'null' : endTime}, ${confidence})`
    );

    results.push({ conditionId: id, endTime, confidence });
    foundIds.add(id);
  }

  // Third pass: fuzzy match unmatched IDs
  const unmatchedIds = parsedEntries.filter(({ id }) => !marketMap.has(id));
  const missingMarketIds = validIds.filter((id) => !foundIds.has(id));

  for (const { id, dateStr, rawConfidence } of unmatchedIds) {
    const matchedId = findClosestConditionId(id, missingMarketIds);
    if (matchedId && !foundIds.has(matchedId)) {
      const endTime = parseEndTimeValue(dateStr, now);
      const confidence = normalizeConfidence(rawConfidence, endTime);
      console.log(
        `[LLM:endTime]   "${marketMap.get(matchedId)!.question}" -> ${dateStr} (${endTime === null ? 'null' : endTime}, ${confidence}) (fuzzy)`
      );

      results.push({ conditionId: matchedId, endTime, confidence });
      foundIds.add(matchedId);
    }
  }

  const endTimeMissing = markets
    .filter((m) => !foundIds.has(m.conditionId))
    .map((m) => m.conditionId.slice(0, 10));
  if (endTimeMissing.length > 0) {
    console.warn(
      `[LLM:endTime] Warning: ${endTimeMissing.length} markets missing from response: ${endTimeMissing.join(', ')}...`
    );
  }

  return results;
}

/**
 * Try parsing the response as a JSON array of {id, ts, confidence}. Returns
 * null if the content isn't valid JSON or isn't an array — caller then falls
 * back to CSV. Strips ```json fences before attempting to parse, since
 * Sonar sometimes wraps despite the instruction.
 */
function tryParseJsonArray(content: string): Array<{
  id: string;
  dateStr: string;
  rawConfidence: string | null;
}> | null {
  const stripped = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  if (!stripped.startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (!Array.isArray(parsed)) return null;
    const out: Array<{
      id: string;
      dateStr: string;
      rawConfidence: string | null;
    }> = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== 'string') continue;
      const tsField = rec.ts;
      const dateStr =
        typeof tsField === 'string'
          ? tsField
          : tsField === null
            ? 'UNKNOWN'
            : '';
      const rawConfidence =
        typeof rec.confidence === 'string' ? rec.confidence : null;
      out.push({ id: rec.id, dateStr, rawConfidence });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Legacy CSV parser kept as fallback so a model regressing to the old format
 * doesn't take the whole batch to UNKNOWN. CSV has no confidence field; we
 * synthesize 'low' for resolved dates and 'unknown' for UNKNOWN/null.
 */
function parseCsvFallback(content: string): Array<{
  id: string;
  dateStr: string;
  rawConfidence: string | null;
}> {
  const entries: Array<{
    id: string;
    dateStr: string;
    rawConfidence: string | null;
  }> = [];
  const lines = content.split('\n').filter((line) => line.trim());
  for (const line of lines) {
    if (
      line.startsWith('```') ||
      line.startsWith('id,') ||
      line.startsWith('<')
    ) {
      continue;
    }
    const parsed = splitIdFromRest(line);
    if (!parsed) {
      console.warn(
        `[LLM:endTime] Skipping malformed line: ${line.slice(0, 50)}...`
      );
      continue;
    }
    entries.push({
      id: parsed.id,
      dateStr: parsed.rest,
      rawConfidence: null,
    });
  }
  return entries;
}

function normalizeConfidence(
  raw: string | null,
  endTime: number | null
): EndTimeConfidence {
  if (raw === 'high' || raw === 'low' || raw === 'unknown') return raw;
  // No / invalid confidence reported (CSV fallback, malformed): infer.
  return endTime === null ? 'unknown' : 'low';
}

/**
 * Parse a date string into a unix timestamp, or null if invalid/past/UNKNOWN
 */
function parseEndTimeValue(dateStr: string, now: number): number | null {
  const trimmed = dateStr.trim().toUpperCase();
  if (trimmed === 'UNKNOWN' || trimmed === '') return null;

  const date = new Date(dateStr.trim());
  if (isNaN(date.getTime())) {
    console.warn(`[LLM:endTime] Invalid date: ${dateStr}`);
    return null;
  }

  const timestamp = Math.floor(date.getTime() / 1000);
  if (timestamp <= now) {
    console.warn(`[LLM:endTime] Past date rejected: ${dateStr}`);
    return null;
  }

  return timestamp;
}

/**
 * Call OpenRouter for endTime determination using Perplexity Sonar
 */
export async function callOpenRouterForEndTime(
  markets: EndTimeEnrichmentInput[],
  config: { apiKey: string; model?: string }
): Promise<EndTimeOutput[]> {
  const prompt = buildEndTimePrompt(markets);
  const model = config.model || 'perplexity/sonar';

  console.log(`[LLM:endTime] Calling OpenRouter with model: ${model}`);
  console.log(
    `[LLM:endTime] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`
  );

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'market-keeper',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ENDTIME_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        // Temperature 0.0: this is a structured extraction task, not a
        // creative one — we want maximally deterministic JSON output.
        temperature: 0.0,
        max_tokens: 10000,
      }),
      signal: AbortSignal.timeout(LLM_ENDTIME_TIMEOUT_MS),
    },
    3,
    1000
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[LLM:endTime] API error: ${response.status} - ${error}`);
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const finishReason = data.choices?.[0]?.finish_reason;

  if (data.usage) {
    console.log(
      `[LLM:endTime] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total tokens`
    );
  }

  if (finishReason === 'length') {
    console.warn(
      `[LLM:endTime] WARNING: Response was truncated (hit token limit).`
    );
  }

  console.log(
    `[LLM:endTime] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`
  );

  const results = parseEndTimeResponse(content, markets);
  console.log(`[LLM:endTime] Parsed ${results.length} endTime results`);

  // Per-market logging: drive off parsed results (JSON-aware) rather than
  // re-parsing the raw text. Status reflects how the parser classified each
  // entry, not the literal CSV split that the previous version assumed.
  const parsedEndTimeSet = new Map(results.map((r) => [r.conditionId, r]));
  logLLMResponse('endTime', markets, content, {
    model,
    prompt,
    usage: data.usage,
    finishReason,
    citations: data.citations ?? [],
    parsedResults: markets.map((m) => {
      const result = parsedEndTimeSet.get(m.conditionId);
      let status: 'ok' | 'unknown' | 'rejected-past' | 'missing';
      let parsed: string;
      if (!result) {
        status = 'missing';
        parsed = 'N/A';
      } else if (result.confidence === 'unknown' && result.endTime === null) {
        status = 'unknown';
        parsed = 'UNKNOWN';
      } else if (result.endTime === null) {
        status = 'rejected-past';
        parsed = 'rejected (past date)';
      } else {
        status = 'ok';
        parsed = `${new Date(result.endTime * 1000).toISOString()} [${result.confidence}]`;
      }
      const raw = result ? `confidence=${result.confidence}` : '(missing)';
      return { question: m.question, raw, parsed, status };
    }),
  });

  return results;
}
