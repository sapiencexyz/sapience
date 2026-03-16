/**
 * Fetch event tags from Polymarket's /events endpoint
 */

import { fetchWithRetry } from '../utils';

interface PolymarketEventTag {
  label?: string;
  slug?: string;
}

interface PolymarketEvent {
  slug?: string;
  tags?: PolymarketEventTag[];
}

/**
 * Fetch events from Polymarket and return a map of event slug → tag labels.
 * Filters out the generic "All" tag and deduplicates labels.
 */
export async function fetchEventTags(opts: {
  endDateMin: string;
  endDateMax: string;
}): Promise<Map<string, string[]>> {
  const tagMap = new Map<string, string[]>();

  const url = `https://gamma-api.polymarket.com/events?end_date_min=${opts.endDateMin}&end_date_max=${opts.endDateMax}&limit=500`;

  const response = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    console.error(
      `[Tags] Failed to fetch events: HTTP ${response.status} ${response.statusText}`
    );
    return tagMap;
  }

  const events: PolymarketEvent[] = await response.json();

  for (const event of events) {
    if (!event.slug) continue;

    const labels = (event.tags ?? [])
      .map((t) => t.label)
      .filter((label): label is string => !!label && label !== 'All');

    // Deduplicate
    tagMap.set(event.slug, [...new Set(labels)]);
  }

  return tagMap;
}
