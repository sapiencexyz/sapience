/**
 * Fetch event tags from Polymarket's /events endpoint
 */

import { fetchWithRetry } from '../utils';

interface PolymarketEventTag {
  label?: string;
  slug?: string;
}

// AP-style title-case "small words" that stay lowercase when they're
// neither the first nor the last word. Articles, coordinating
// conjunctions, and prepositions ≤ 3 letters. Includes "vs" (sports
// journalism convention) and "x" (Polymarket matchup separator).
const TITLE_CASE_SMALL_WORDS = new Set([
  // Articles
  'a',
  'an',
  'the',
  // Coordinating conjunctions
  'and',
  'but',
  'for',
  'nor',
  'or',
  'so',
  'yet',
  // Short prepositions (≤3 letters)
  'as',
  'at',
  'by',
  'in',
  'of',
  'off',
  'on',
  'per',
  'to',
  'up',
  'via',
  // Domain-specific
  'vs',
  'x',
]);

// AP-style Title Case. Each word:
//   1) Acronym/mixed-case preservation — any word containing an
//      uppercase letter is left alone (UFC, NFL, DeFi, iOS, F1, U.S.).
//   2) First and last words are always capitalized (even if they're
//      small words: "Of Mice and Men", "Things to Come To").
//   3) Small-word skip — articles, coord. conjunctions, ≤3-letter
//      prepositions stay lowercase. ALL-CAPS forms ("OR" the Oregon
//      state code) bypass this and are treated as acronyms.
// Splits on space only — hyphenated tags like "updated-tag" stay as
// one word ("Updated-tag").
// Mirrors normalizeTags in packages/api/src/routes/conditions.ts.
export function normalizeTagLabel(label: string): string {
  if (!label) return label;
  const words = label.split(' ');
  return words
    .map((w, i) => {
      const isFirst = i === 0;
      const isLast = i === words.length - 1;
      const isAllUpper = /[A-Z]/.test(w) && w === w.toUpperCase();
      // Small-word skip — only mid-tag, only when not all-caps.
      if (
        !isFirst &&
        !isLast &&
        !isAllUpper &&
        TITLE_CASE_SMALL_WORDS.has(w.toLowerCase())
      ) {
        return w.toLowerCase();
      }
      // Preserve acronyms and mixed-case brands.
      if (/[A-Z]/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

interface PolymarketEvent {
  slug?: string;
  tags?: PolymarketEventTag[];
}

const PAGE_SIZE = 500;

/**
 * Fetch events from Polymarket and return a map of event slug → tag labels.
 * Filters out the generic "All" tag and deduplicates labels.
 * Paginates through all results using offset.
 */
export async function fetchEventTags(opts: {
  endDateMin: string;
  endDateMax: string;
}): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://gamma-api.polymarket.com/events?end_date_min=${opts.endDateMin}&end_date_max=${opts.endDateMax}&limit=${PAGE_SIZE}&offset=${offset}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error(
        `[Tags] Failed to fetch events (offset=${offset}): HTTP ${response.status} ${response.statusText}`
      );
      break;
    }

    const events: PolymarketEvent[] = await response.json();

    for (const event of events) {
      if (!event.slug) continue;

      const labels = (event.tags ?? [])
        .map((t) => t.label)
        .filter((label): label is string => !!label && label !== 'All')
        .map(normalizeTagLabel);

      // Deduplicate
      tagMap.set(event.slug, [...new Set(labels)]);
    }

    if (events.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`[Tags] Fetched ${tagMap.size} event tag mappings`);
  return tagMap;
}
