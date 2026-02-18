/**
 * OpenRouter API client
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchWithRetry } from '../utils';
import type { MarketEnrichmentInput, MarketEnrichmentOutput, CategoryOutput, ShortNameOnlyOutput } from './types';
import {
  buildCategoryPrompt,
  buildShortNameOnlyPrompt,
  buildBothPrompt,
  CATEGORY_SYSTEM_PROMPT,
  SHORTNAME_ONLY_SYSTEM_PROMPT,
  BOTH_SYSTEM_PROMPT,
  VALID_CATEGORIES,
} from './prompts';
import type { SapienceCategorySlug } from '../types';

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

/**
 * Log LLM request and response to file (non-production only)
 * Recreates the log file on first call of each run
 */
function logLLMResponse(
  type: 'category' | 'shortName',
  markets: MarketEnrichmentInput[],
  response: string
): void {
  // Skip logging in production
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const timestamp = new Date().toISOString();
  const marketList = markets.map((m) => `  - ${m.conditionId}: ${m.question}`).join('\n');
  const logEntry = `=== ${timestamp} | ${type.toUpperCase()} REQUEST (${markets.length} markets) ===
Markets:
${marketList}

Response:
${response}
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
  console.log(`[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`);

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'polymarket-keeper',
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
    console.warn(`[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`);
  }

  console.log(`[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`);

  // Log to file
  logLLMResponse('category', markets, content);

  const results = parseCategoryResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} category results`);

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
  console.log(`[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`);

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'polymarket-keeper',
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
    console.warn(`[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`);
  }

  console.log(`[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`);

  // Log to file
  logLLMResponse('shortName', markets, content);

  const results = parseShortNameOnlyResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} shortName results`);

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

  console.log(`[LLM] Calling OpenRouter (category + shortName) with model: ${model}`);
  console.log(`[LLM] Request: ${markets.length} markets, prompt length: ${prompt.length} chars`);

  const response = await fetchWithRetry(
    OPENROUTER_API_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://sapience.xyz',
        'X-Title': 'polymarket-keeper',
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
    console.warn(`[LLM] WARNING: Response was truncated (hit token limit). Consider reducing batch size.`);
  }

  console.log(`[LLM] Raw response (${content.length} chars, finish_reason: ${finishReason}):\n${content}`);

  // Log to file
  logLLMResponse('shortName', markets, content);

  const results = parseBothResponse(content, markets);
  console.log(`[LLM] Parsed ${results.length} results`);

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
    console.log(`[LLM] Fuzzy matched "${id.slice(0, 15)}..." to "${bestMatch.slice(0, 15)}..." (distance: ${bestDistance})`);
  }

  return bestMatch;
}

/**
 * Parse category-only response (id,category)
 */
function parseCategoryResponse(content: string, markets: MarketEnrichmentInput[]): CategoryOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: CategoryOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines with their categories
  const parsedLines: Array<{ id: string; cat: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (line.startsWith('```') || line.startsWith('id,') || line.startsWith('<')) {
      continue;
    }

    // Parse CSV: id,category
    const firstComma = line.indexOf(',');
    if (firstComma === -1) {
      console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      continue;
    }

    const id = line.slice(0, firstComma).trim();
    const cat = line.slice(firstComma + 1).trim();
    parsedLines.push({ id, cat });
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

    console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}`);

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

      console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category} (fuzzy)`);

      results.push({
        conditionId: matchedId,
        category,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets.filter((m) => !foundIds.has(m.conditionId)).map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(`[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`);
  }

  return results;
}

/**
 * Parse short-name-only response (id,shortName)
 */
function parseShortNameOnlyResponse(content: string, markets: MarketEnrichmentInput[]): ShortNameOnlyOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: ShortNameOnlyOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines
  const parsedLines: Array<{ id: string; name: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (line.startsWith('```') || line.startsWith('id,') || line.startsWith('<')) {
      continue;
    }

    // Parse CSV: id,shortName
    const firstComma = line.indexOf(',');
    if (firstComma === -1) {
      console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      continue;
    }

    const id = line.slice(0, firstComma).trim();
    const name = line.slice(firstComma + 1).trim();
    parsedLines.push({ id, name });
  }

  // Second pass: match exact IDs
  for (const { id, name } of parsedLines) {
    if (!marketMap.has(id)) {
      continue;
    }

    const market = marketMap.get(id)!;
    const shortName = ensureQuestionMark(name || market.question);

    console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> name: "${shortName}"`);

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

      console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> name: "${shortName}" (fuzzy)`);

      results.push({
        conditionId: matchedId,
        shortName,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets.filter((m) => !foundIds.has(m.conditionId)).map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(`[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`);
  }

  return results;
}

/**
 * Parse full response (id,category,shortName)
 */
function parseBothResponse(content: string, markets: MarketEnrichmentInput[]): MarketEnrichmentOutput[] {
  const marketMap = new Map(markets.map((m) => [m.conditionId, m]));
  const validIds = markets.map((m) => m.conditionId);
  const results: MarketEnrichmentOutput[] = [];
  const foundIds = new Set<string>();

  // First pass: collect all parsed lines
  const parsedLines: Array<{ id: string; cat: string; name: string }> = [];

  const lines = content.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    // Skip markdown code blocks or headers
    if (line.startsWith('```') || line.startsWith('id,') || line.startsWith('<')) {
      continue;
    }

    // Parse CSV: id,category,shortName (shortName may contain commas, so split carefully)
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);

    if (firstComma === -1 || secondComma === -1) {
      console.warn(`[LLM] Skipping malformed line: ${line.slice(0, 50)}...`);
      continue;
    }

    const id = line.slice(0, firstComma).trim();
    const cat = line.slice(firstComma + 1, secondComma).trim();
    const name = line.slice(secondComma + 1).trim();
    parsedLines.push({ id, cat, name });
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

    console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}, name: "${shortName}"`);

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

      console.log(`[LLM]   "${market.question.slice(0, 50)}..." -> cat: ${category}, name: "${shortName}" (fuzzy)`);

      results.push({
        conditionId: matchedId,
        category,
        shortName,
      });
      foundIds.add(matchedId);
    }
  }

  // Check for still missing markets
  const stillMissingIds = markets.filter((m) => !foundIds.has(m.conditionId)).map((m) => m.conditionId.slice(0, 10));
  if (stillMissingIds.length > 0) {
    console.warn(`[LLM] Warning: ${stillMissingIds.length} markets missing from response: ${stillMissingIds.join(', ')}...`);
  }

  return results;
}
