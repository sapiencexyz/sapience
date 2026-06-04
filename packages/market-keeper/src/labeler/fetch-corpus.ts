/**
 * One-shot Polymarket corpus fetcher for the endTime labeling tool.
 *
 * Pulls two market sets and merges them:
 *   - top 1000 currently-active markets ordered by lifetime volume
 *   - latest 200 markets in each Polymarket tag/category
 *
 * Deduped by conditionId, sorted by volume desc, written to
 * src/labeler/data/corpus.json.
 *
 * Polymarket rate limit: /markets is 300 req/10s. We pace at ~10 req/s
 * (100 ms between calls) to leave headroom for retries.
 */

import * as fs from 'fs';
import * as path from 'path';

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const PER_PAGE = 100;
const POLITE_PAUSE_MS = 100;

const TOP_BY_VOLUME_LIMIT = 1000;
const PER_CATEGORY_LIMIT = 200;

type RawMarket = {
  conditionId?: string;
  question?: string;
  description?: string;
  endDate?: string | null;
  endDateIso?: string | null;
  slug?: string;
  volume?: string | number | null;
  volumeNum?: number | null;
  events?: Array<{
    id?: string;
    title?: string;
    slug?: string;
    tags?: Array<{ slug?: string; label?: string }>;
  }>;
  groupItemTitle?: string | null;
  sportsMarketType?: string | null;
};

type RawTag = {
  id?: string | number;
  slug?: string;
  label?: string;
};

export type CorpusEntry = {
  conditionId: string;
  question: string;
  description: string;
  endDate: string | null;
  slug: string;
  volume: number;
  eventTitle: string | null;
  eventSlug: string | null;
  sportsMarketType: string | null;
  groupItemTitle: string | null;
  sourceTagSlug: string | null;
};

async function gammaGet(urlPath: string): Promise<unknown> {
  const res = await fetch(`${GAMMA_BASE}${urlPath}`);
  if (!res.ok) {
    throw new Error(`gamma ${urlPath} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function pause(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchMarketPage(query: string): Promise<RawMarket[]> {
  const data = await gammaGet(`/markets?${query}`);
  if (!Array.isArray(data)) return [];
  return data as RawMarket[];
}

async function fetchPaginated(
  baseQuery: string,
  limit: number
): Promise<RawMarket[]> {
  const out: RawMarket[] = [];
  for (let offset = 0; offset < limit; offset += PER_PAGE) {
    const take = Math.min(PER_PAGE, limit - offset);
    const batch = await fetchMarketPage(
      `${baseQuery}&limit=${take}&offset=${offset}`
    );
    if (!batch.length) break;
    out.push(...batch);
    if (batch.length < take) break;
    await pause(POLITE_PAUSE_MS);
  }
  return out;
}

async function fetchTopByVolume(limit: number): Promise<RawMarket[]> {
  return fetchPaginated(
    'closed=false&active=true&order=volumeNum&ascending=false',
    limit
  );
}

// Curated list of Polymarket's top-level categories. Their /tags endpoint is
// flat and surfaces long-tail entity tags (e.g. `caitlin-clark`,
// `viktoria-plzen`) rather than the homepage taxonomy, so we hard-code the
// taxonomy the FE actually shows as tabs. Override via LABELER_TAGS env var
// (comma-separated slugs).
const DEFAULT_TAGS: RawTag[] = [
  { slug: 'politics', label: 'Politics' },
  { slug: 'elections', label: 'Elections' },
  { slug: 'sports', label: 'Sports' },
  { slug: 'crypto', label: 'Crypto' },
  { slug: 'crypto-prices', label: 'Crypto Prices' },
  { slug: 'pop-culture', label: 'Pop Culture' },
  { slug: 'business', label: 'Business' },
  { slug: 'science', label: 'Science' },
  { slug: 'tech', label: 'Tech' },
  { slug: 'climate', label: 'Climate' },
  { slug: 'world', label: 'World' },
  { slug: 'middle-east', label: 'Middle East' },
  { slug: 'mentions', label: 'Mentions' },
  { slug: 'trump', label: 'Trump' },
  { slug: 'ai', label: 'AI' },
];

function getTags(): RawTag[] {
  const override = process.env.LABELER_TAGS;
  if (override) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((slug) => ({ slug, label: slug }));
  }
  return DEFAULT_TAGS;
}

type RawEvent = {
  id?: string;
  title?: string;
  slug?: string;
  markets?: RawMarket[];
  tags?: Array<{ slug?: string; label?: string }>;
};

async function fetchEventPage(query: string): Promise<RawEvent[]> {
  const data = await gammaGet(`/events?${query}`);
  if (!Array.isArray(data)) return [];
  return data as RawEvent[];
}

/**
 * Polymarket's `/markets?tag_slug=X` endpoint silently ignores the filter
 * (verified empirically: tag_slug=sports and tag_slug=crypto return the same
 * default list). The `/events?tag_slug=X` endpoint *does* honor it and embeds
 * each event's full markets array — so we paginate events and harvest their
 * markets until we have `marketLimit` for the tag.
 */
async function fetchLatestForTag(
  tagSlug: string,
  marketLimit: number
): Promise<RawMarket[]> {
  const out: RawMarket[] = [];
  const seenConditionIds = new Set<string>();
  const EVENT_PAGE = 100;
  const MAX_EVENT_PAGES = 10; // soft cap at 1000 events per tag

  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const events = await fetchEventPage(
      `closed=false&active=true&tag_slug=${encodeURIComponent(tagSlug)}` +
        `&order=startDate&ascending=false&limit=${EVENT_PAGE}` +
        `&offset=${page * EVENT_PAGE}`
    );
    if (!events.length) break;

    for (const ev of events) {
      for (const m of ev.markets ?? []) {
        if (!m.conditionId) continue;
        if (seenConditionIds.has(m.conditionId)) continue;
        seenConditionIds.add(m.conditionId);
        // Attach the event metadata since the embedded market entry doesn't
        // always carry its own `events` field.
        if (!m.events || m.events.length === 0) {
          m.events = [{ id: ev.id, title: ev.title, slug: ev.slug }];
        }
        out.push(m);
        if (out.length >= marketLimit) return out;
      }
    }
    if (events.length < EVENT_PAGE) break;
    await pause(POLITE_PAUSE_MS);
  }
  return out;
}

function toCorpusEntry(
  m: RawMarket,
  sourceTagSlug: string | null
): CorpusEntry | null {
  if (!m.conditionId || !m.question) return null;
  const ev = m.events?.[0];
  let volume: number = 0;
  if (typeof m.volumeNum === 'number') volume = m.volumeNum;
  else if (typeof m.volume === 'number') volume = m.volume;
  else if (typeof m.volume === 'string') volume = parseFloat(m.volume) || 0;
  return {
    conditionId: m.conditionId,
    question: m.question,
    description: m.description ?? '',
    endDate: m.endDate ?? m.endDateIso ?? null,
    slug: m.slug ?? '',
    volume,
    eventTitle: ev?.title ?? null,
    eventSlug: ev?.slug ?? null,
    sportsMarketType: m.sportsMarketType ?? null,
    groupItemTitle: m.groupItemTitle ?? null,
    sourceTagSlug,
  };
}

export async function fetchCorpus(): Promise<CorpusEntry[]> {
  console.log(`[fetch-corpus] top ${TOP_BY_VOLUME_LIMIT} by volume…`);
  const topVol = await fetchTopByVolume(TOP_BY_VOLUME_LIMIT);
  console.log(`[fetch-corpus]   got ${topVol.length} markets`);

  const tags = getTags();
  console.log(
    `[fetch-corpus] ${tags.length} category tags: ${tags
      .map((t) => t.slug)
      .join(', ')}`
  );

  const byTag: Array<{ tagSlug: string; markets: RawMarket[] }> = [];
  for (const tag of tags) {
    if (!tag.slug) continue;
    try {
      const markets = await fetchLatestForTag(tag.slug, PER_CATEGORY_LIMIT);
      console.log(`[fetch-corpus]   tag:${tag.slug} → ${markets.length}`);
      byTag.push({ tagSlug: tag.slug, markets });
      await pause(POLITE_PAUSE_MS);
    } catch (err) {
      console.warn(`[fetch-corpus]   tag:${tag.slug} failed: ${err}`);
    }
  }

  const byId = new Map<string, CorpusEntry>();
  for (const m of topVol) {
    const entry = toCorpusEntry(m, null);
    if (!entry) continue;
    byId.set(entry.conditionId, entry);
  }
  for (const { tagSlug, markets } of byTag) {
    for (const m of markets) {
      const entry = toCorpusEntry(m, tagSlug);
      if (!entry) continue;
      // Keep first-seen entry but remember the tag if missing.
      const existing = byId.get(entry.conditionId);
      if (!existing) {
        byId.set(entry.conditionId, entry);
      } else if (!existing.sourceTagSlug && tagSlug) {
        existing.sourceTagSlug = tagSlug;
      }
    }
  }

  const corpus = Array.from(byId.values()).sort((a, b) => b.volume - a.volume);
  console.log(
    `[fetch-corpus] merged corpus: ${corpus.length} unique markets ` +
      `(top vol $${Math.round(corpus[0]?.volume ?? 0).toLocaleString()}, ` +
      `median $${Math.round(
        corpus[Math.floor(corpus.length / 2)]?.volume ?? 0
      ).toLocaleString()})`
  );
  return corpus;
}

async function main(): Promise<void> {
  const corpus = await fetchCorpus();
  const dataDir = path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const outPath = path.join(dataDir, 'corpus.json');
  fs.writeFileSync(outPath, JSON.stringify(corpus, null, 2));
  console.log(`[fetch-corpus] wrote ${corpus.length} markets → ${outPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
