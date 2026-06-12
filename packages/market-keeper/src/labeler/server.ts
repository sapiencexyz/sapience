/**
 * Minimal HTTP server for the endTime labeling UI.
 *
 * Serves index.html on `/` and a small JSON API on `/api/*`.
 * Reads corpus.json (produced by fetch-corpus.ts) and writes labels.json
 * in the same data dir. No frameworks, no dependencies beyond Node built-ins.
 *
 * Env:
 *   LABELER_PORT   override the default port 5757
 *   LABELER_DATA   override the data dir (defaults to ./data)
 */

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { URL } from 'url';

import { extractEndTime } from '../generate/endtime';

const PORT = parseInt(process.env.LABELER_PORT ?? '5757', 10);
const DATA_DIR = process.env.LABELER_DATA ?? path.join(__dirname, 'data');
const CORPUS_PATH = path.join(DATA_DIR, 'corpus.json');
const LABELS_PATH = path.join(DATA_DIR, 'labels.json');
const HTML_PATH = path.join(__dirname, 'index.html');

type CorpusEntry = {
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

type Decision = 'labeled' | 'no-time' | 'skipped';
type LabelSource = 'polymarket' | 'regex' | 'custom' | 'sibling';

type Label = {
  conditionId: string;
  humanEndTime: string | null; // ISO UTC, null when decision !== 'labeled'
  decision: Decision;
  source: LabelSource | null;
  // True when the saved time is confident at sub-day precision (specific game
  // time, explicit deadline, Polymarket endDate that looks accurate).
  // False when the user used end-of-day or a date-only educated guess.
  // Downstream evaluations can filter on this: time-precision benchmarks
  // count only `precise: true` rows; date-level benchmarks use all rows.
  precise: boolean;
  labeledAt: string;
};

type SiblingGroup = {
  humanEndTime: string;
  precise: boolean;
  count: number;
  exampleQuestion: string;
  sources: Record<LabelSource, number>;
};

function loadCorpus(): CorpusEntry[] {
  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(
      `corpus.json not found at ${CORPUS_PATH}. ` +
        `Run \`pnpm labeler:fetch\` first.`
    );
  }
  return JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8')) as CorpusEntry[];
}

function loadLabels(): Map<string, Label> {
  if (!fs.existsSync(LABELS_PATH)) return new Map();
  const raw = JSON.parse(fs.readFileSync(LABELS_PATH, 'utf8')) as Array<
    Partial<Label> & { conditionId: string }
  >;
  // Backfill: pre-existing labels predate the `precise` field. Default them
  // to `true` (the user already noted they'll re-flag any EOD-ish ones).
  return new Map(
    raw.map((l) => [
      l.conditionId,
      {
        conditionId: l.conditionId,
        humanEndTime: l.humanEndTime ?? null,
        decision: (l.decision ?? 'skipped') as Decision,
        source: (l.source ?? null) as LabelSource | null,
        precise: l.precise ?? true,
        labeledAt: l.labeledAt ?? new Date().toISOString(),
      },
    ])
  );
}

function saveLabels(labels: Map<string, Label>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Persist as an array so a human can diff/inspect in stable order.
  const arr = Array.from(labels.values()).sort((a, b) =>
    a.conditionId.localeCompare(b.conditionId)
  );
  fs.writeFileSync(LABELS_PATH, JSON.stringify(arr, null, 2));
}

function regexFor(entry: CorpusEntry): {
  unix: number;
  iso: string;
  tier: string;
} | null {
  const out = { tier: '' };
  const ts = extractEndTime(entry.question, entry.description ?? '', out);
  if (ts === null) return null;
  return {
    unix: ts,
    iso: new Date(ts * 1000).toISOString(),
    tier: out.tier,
  };
}

type FilterStatus = 'unlabeled' | 'labeled' | 'no-time' | 'skipped' | 'all';

type EntryFilter = {
  status: FilterStatus;
  tag: string | null; // sourceTagSlug match; null = any
  hideLabeledSiblings: boolean;
};

function parseFilter(searchParams: URLSearchParams): EntryFilter {
  const raw = (searchParams.get('status') ?? 'unlabeled').toLowerCase();
  const status: FilterStatus =
    raw === 'labeled' ||
    raw === 'no-time' ||
    raw === 'skipped' ||
    raw === 'all' ||
    raw === 'unlabeled'
      ? (raw as FilterStatus)
      : 'unlabeled';
  const tagRaw = searchParams.get('tag');
  const tag = tagRaw && tagRaw.trim() ? tagRaw.trim() : null;
  const hideLabeledSiblings = searchParams.get('hideSiblings') === '1';
  return { status, tag, hideLabeledSiblings };
}

/**
 * Build the set of event keys (slug- or title-anchored) that already contain
 * at least one labeled member. The `hide labeled siblings` filter rejects
 * any *unlabeled* corpus entry whose event is in this set — concentrating
 * remaining work on fresh events, not the 5th NBA game of an already-
 * decided event group.
 */
function buildLabeledEventSet(
  corpus: CorpusEntry[],
  labels: Map<string, Label>
): Set<string> {
  const out = new Set<string>();
  for (const entry of corpus) {
    const lbl = labels.get(entry.conditionId);
    if (!lbl) continue;
    if (entry.eventSlug) out.add(`slug:${entry.eventSlug}`);
    else if (entry.eventTitle) out.add(`title:${entry.eventTitle}`);
  }
  return out;
}

function eventKeyOf(entry: CorpusEntry): string | null {
  if (entry.eventSlug) return `slug:${entry.eventSlug}`;
  if (entry.eventTitle) return `title:${entry.eventTitle}`;
  return null;
}

function entryMatchesFilter(
  entry: CorpusEntry,
  label: Label | undefined,
  filter: EntryFilter,
  labeledEventSet?: Set<string> | null
): boolean {
  if (filter.tag) {
    if ((entry.sourceTagSlug ?? '') !== filter.tag) return false;
  }
  // Hide siblings: only meaningful when iterating unlabeled markets.
  // Already-labeled markets are not "siblings to skip" — the user may be
  // navigating back to one, so we let them pass even when the flag is on.
  if (
    filter.hideLabeledSiblings &&
    !label &&
    labeledEventSet &&
    labeledEventSet.size > 0
  ) {
    const key = eventKeyOf(entry);
    if (key && labeledEventSet.has(key)) return false;
  }
  switch (filter.status) {
    case 'all':
      return true;
    case 'unlabeled':
      return !label;
    case 'labeled':
      return !!label && label.decision === 'labeled';
    case 'no-time':
      return !!label && label.decision === 'no-time';
    case 'skipped':
      return !!label && label.decision === 'skipped';
  }
}

function progressOf(
  corpus: CorpusEntry[],
  labels: Map<string, Label>,
  filter?: EntryFilter
): {
  total: number;
  decided: number;
  labeled: number;
  skipped: number;
  events: { total: number; covered: number };
  filtered?: { matching: number; remaining: number };
} {
  const total = corpus.length;
  const decided = labels.size;
  let labeled = 0;
  let skipped = 0;
  for (const l of labels.values()) {
    if (l.decision === 'labeled' || l.decision === 'no-time') labeled++;
    if (l.decision === 'skipped') skipped++;
  }
  // Event coverage: how many distinct event groups have at least one
  // labeled (decision: 'labeled' or 'no-time') member. Matches the
  // sibling-dedup filter's notion of "touched event" so the numerator
  // here and the queue size in fresh-events mode stay self-consistent.
  // Markets with no event metadata each count as their own event.
  const eventKeysInCorpus = new Set<string>();
  const eventKeysCovered = new Set<string>();
  for (const entry of corpus) {
    const key = eventKeyOf(entry) ?? `solo:${entry.conditionId}`;
    eventKeysInCorpus.add(key);
    const lbl = labels.get(entry.conditionId);
    if (!lbl) continue;
    if (lbl.decision === 'labeled' || lbl.decision === 'no-time') {
      eventKeysCovered.add(key);
    }
  }
  const out: ReturnType<typeof progressOf> = {
    total,
    decided,
    labeled,
    skipped,
    events: {
      total: eventKeysInCorpus.size,
      covered: eventKeysCovered.size,
    },
  };
  if (filter) {
    const labeledEventSet = filter.hideLabeledSiblings
      ? buildLabeledEventSet(corpus, labels)
      : null;
    let matching = 0;
    for (const entry of corpus) {
      if (
        entryMatchesFilter(
          entry,
          labels.get(entry.conditionId),
          filter,
          labeledEventSet
        )
      ) {
        matching++;
      }
    }
    out.filtered = { matching, remaining: matching };
  }
  return out;
}

function listCategories(corpus: CorpusEntry[]): Array<{
  tag: string;
  total: number;
}> {
  const counts = new Map<string, number>();
  for (const e of corpus) {
    const t = e.sourceTagSlug;
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([tag, total]) => ({ tag, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Find sibling conditions — same parent event — that already have a
 * `decision: 'labeled'` row, and group them by their saved humanEndTime.
 * The labeler shows these as one-click buttons so the user can apply a
 * sibling's verdict without retyping. Capped to keep the UI compact.
 */
function getSiblingLabels(
  entry: CorpusEntry,
  corpus: CorpusEntry[],
  labels: Map<string, Label>
): SiblingGroup[] {
  if (!entry.eventSlug && !entry.eventTitle) return [];
  // Group by (humanEndTime, precise). A precise label at T and an imprecise
  // label at T are different decisions even though the timestamp matches —
  // splitting them lets the user inherit either intent on one click.
  const byKey = new Map<string, SiblingGroup>();
  for (const sib of corpus) {
    if (sib.conditionId === entry.conditionId) continue;
    const sameSlug = entry.eventSlug && sib.eventSlug === entry.eventSlug;
    const sameTitle =
      !entry.eventSlug &&
      entry.eventTitle &&
      sib.eventTitle === entry.eventTitle;
    if (!sameSlug && !sameTitle) continue;
    const lbl = labels.get(sib.conditionId);
    if (!lbl || lbl.decision !== 'labeled' || !lbl.humanEndTime) continue;
    const key = `${lbl.humanEndTime}::${lbl.precise ? 'p' : 'i'}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count++;
      const src = lbl.source ?? 'custom';
      existing.sources[src] = (existing.sources[src] ?? 0) + 1;
    } else {
      byKey.set(key, {
        humanEndTime: lbl.humanEndTime,
        precise: lbl.precise,
        count: 1,
        exampleQuestion: sib.question,
        sources: {
          polymarket: 0,
          regex: 0,
          custom: 0,
          sibling: 0,
          [lbl.source ?? 'custom']: 1,
        } as Record<LabelSource, number>,
      });
    }
  }
  // Most-popular first; cap at 5 distinct (time, precise) groups so the
  // bar stays compact. Tie-break precise above imprecise so the safer
  // option surfaces first when counts are equal.
  return Array.from(byKey.values())
    .sort(
      (a, b) =>
        b.count - a.count || (a.precise === b.precise ? 0 : a.precise ? -1 : 1)
    )
    .slice(0, 5);
}

function buildPayload(
  entry: CorpusEntry,
  index: number,
  existing: Label | undefined,
  corpus: CorpusEntry[],
  labels: Map<string, Label>,
  filter?: EntryFilter
): unknown {
  return {
    entry: { ...entry, regex: regexFor(entry) },
    index,
    existingLabel: existing ?? null,
    siblingLabels: getSiblingLabels(entry, corpus, labels),
    ...progressOf(corpus, labels, filter),
  };
}

function findNextMatching(
  corpus: CorpusEntry[],
  labels: Map<string, Label>,
  fromIndex: number,
  filter: EntryFilter
): number | null {
  const labeledEventSet = filter.hideLabeledSiblings
    ? buildLabeledEventSet(corpus, labels)
    : null;
  for (let i = fromIndex; i < corpus.length; i++) {
    if (
      entryMatchesFilter(
        corpus[i],
        labels.get(corpus[i].conditionId),
        filter,
        labeledEventSet
      )
    ) {
      return i;
    }
  }
  // Wrap once so a back-and-forth user still moves forward.
  for (let i = 0; i < fromIndex; i++) {
    if (
      entryMatchesFilter(
        corpus[i],
        labels.get(corpus[i].conditionId),
        filter,
        labeledEventSet
      )
    ) {
      return i;
    }
  }
  return null;
}

function findPrevMatching(
  corpus: CorpusEntry[],
  labels: Map<string, Label>,
  fromIndex: number,
  filter: EntryFilter
): number | null {
  const labeledEventSet = filter.hideLabeledSiblings
    ? buildLabeledEventSet(corpus, labels)
    : null;
  for (let i = fromIndex; i >= 0; i--) {
    if (
      entryMatchesFilter(
        corpus[i],
        labels.get(corpus[i].conditionId),
        filter,
        labeledEventSet
      )
    ) {
      return i;
    }
  }
  return null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, code: number, payload: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

export function start(): http.Server {
  const corpus = loadCorpus();
  const labels = loadLabels();

  // One-time on-disk migration: any label loaded missing a field was
  // backfilled in memory by loadLabels. Persist that backfill so the file
  // stays consistent and downstream consumers (analytics, exports) never
  // see a half-migrated mix.
  if (fs.existsSync(LABELS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(LABELS_PATH, 'utf8')) as Array<
      Partial<Label>
    >;
    const needsMigration = raw.some((l) => typeof l.precise !== 'boolean');
    if (needsMigration) {
      saveLabels(labels);
      console.log(
        `[labeler] migrated ${labels.size} labels: backfilled precise=true`
      );
    }
  }

  console.log(
    `[labeler] corpus=${corpus.length} markets, ` +
      `existing labels=${labels.size}`
  );

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://localhost:${PORT}`);

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(HTML_PATH));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/progress') {
        const filter = parseFilter(url.searchParams);
        sendJson(res, 200, progressOf(corpus, labels, filter));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/categories') {
        sendJson(res, 200, listCategories(corpus));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/next') {
        const filter = parseFilter(url.searchParams);
        const afterParam = url.searchParams.get('after');
        const startAt = afterParam !== null ? parseInt(afterParam, 10) + 1 : 0;
        const idx = findNextMatching(corpus, labels, startAt, filter);
        if (idx === null) {
          sendJson(res, 200, {
            done: true,
            ...progressOf(corpus, labels, filter),
          });
          return;
        }
        const entry = corpus[idx];
        sendJson(
          res,
          200,
          buildPayload(
            entry,
            idx,
            labels.get(entry.conditionId),
            corpus,
            labels,
            filter
          )
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/prev') {
        const filter = parseFilter(url.searchParams);
        const beforeParam = url.searchParams.get('before');
        const startAt =
          beforeParam !== null
            ? parseInt(beforeParam, 10) - 1
            : corpus.length - 1;
        const idx = findPrevMatching(corpus, labels, startAt, filter);
        if (idx === null) {
          sendJson(res, 200, {
            done: true,
            ...progressOf(corpus, labels, filter),
          });
          return;
        }
        const entry = corpus[idx];
        sendJson(
          res,
          200,
          buildPayload(
            entry,
            idx,
            labels.get(entry.conditionId),
            corpus,
            labels,
            filter
          )
        );
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/at') {
        const filter = parseFilter(url.searchParams);
        const idx = parseInt(url.searchParams.get('index') ?? '', 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= corpus.length) {
          sendJson(res, 404, { error: 'index out of range' });
          return;
        }
        const entry = corpus[idx];
        sendJson(
          res,
          200,
          buildPayload(
            entry,
            idx,
            labels.get(entry.conditionId),
            corpus,
            labels,
            filter
          )
        );
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/label') {
        const body = JSON.parse(await readBody(req)) as Partial<Label>;
        const { conditionId, humanEndTime, decision, source, precise } = body;
        if (!conditionId || !decision) {
          sendJson(res, 400, { error: 'missing conditionId or decision' });
          return;
        }
        if (
          decision !== 'labeled' &&
          decision !== 'no-time' &&
          decision !== 'skipped'
        ) {
          sendJson(res, 400, { error: 'invalid decision' });
          return;
        }
        if (decision === 'labeled' && !humanEndTime) {
          sendJson(res, 400, { error: 'labeled requires humanEndTime' });
          return;
        }
        const validSources: LabelSource[] = [
          'polymarket',
          'regex',
          'custom',
          'sibling',
        ];
        const resolvedSource: LabelSource | null =
          decision === 'labeled'
            ? source && validSources.includes(source as LabelSource)
              ? (source as LabelSource)
              : 'custom'
            : null;
        labels.set(conditionId, {
          conditionId,
          humanEndTime: decision === 'labeled' ? humanEndTime! : null,
          decision,
          source: resolvedSource,
          // Default true so a missing flag never silently degrades an
          // otherwise precise label; only an explicit `false` marks imprecise.
          precise: typeof precise === 'boolean' ? precise : true,
          labeledAt: new Date().toISOString(),
        });
        saveLabels(labels);
        sendJson(res, 200, { ok: true, ...progressOf(corpus, labels) });
        return;
      }

      if (
        req.method === 'POST' &&
        url.pathname === '/api/bulk-flip-precision'
      ) {
        const body = JSON.parse(await readBody(req)) as {
          conditionId?: string;
          humanEndTime?: string;
          currentPrecise?: boolean;
          newPrecise?: boolean;
        };
        if (
          !body.conditionId ||
          !body.humanEndTime ||
          typeof body.currentPrecise !== 'boolean' ||
          typeof body.newPrecise !== 'boolean'
        ) {
          sendJson(res, 400, {
            error:
              'requires conditionId, humanEndTime, currentPrecise, newPrecise',
          });
          return;
        }
        const currentEntry = corpus.find(
          (c) => c.conditionId === body.conditionId
        );
        if (!currentEntry) {
          sendJson(res, 404, { error: 'condition not found in corpus' });
          return;
        }
        // Walk every event member (current market INCLUDED) and flip
        // precision when (humanEndTime, currentPrecise) matches. Including
        // the current market means "flip the whole group" actually flips
        // the whole group — if the current market is already labeled at
        // this (time, precision), the user expects it to flip too.
        // Bounded by event membership so a malformed request can't ever
        // update the whole labels.json — only the in-event subset can
        // ever be touched.
        let updated = 0;
        for (const member of corpus) {
          const isCurrent = member.conditionId === currentEntry.conditionId;
          const sameSlug =
            currentEntry.eventSlug &&
            member.eventSlug === currentEntry.eventSlug;
          const sameTitle =
            !currentEntry.eventSlug &&
            currentEntry.eventTitle &&
            member.eventTitle === currentEntry.eventTitle;
          if (!isCurrent && !sameSlug && !sameTitle) continue;
          const lbl = labels.get(member.conditionId);
          if (!lbl) continue;
          if (lbl.decision !== 'labeled') continue;
          if (lbl.humanEndTime !== body.humanEndTime) continue;
          if (lbl.precise !== body.currentPrecise) continue;
          labels.set(member.conditionId, { ...lbl, precise: body.newPrecise });
          updated++;
        }
        if (updated > 0) saveLabels(labels);
        sendJson(res, 200, { ok: true, updated });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/unlabel') {
        const body = JSON.parse(await readBody(req)) as {
          conditionId?: string;
        };
        if (!body.conditionId) {
          sendJson(res, 400, { error: 'missing conditionId' });
          return;
        }
        labels.delete(body.conditionId);
        saveLabels(labels);
        sendJson(res, 200, { ok: true, ...progressOf(corpus, labels) });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      console.error('[labeler] handler error:', err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.listen(PORT, () => {
    console.log(`[labeler] http://localhost:${PORT}`);
  });

  return server;
}

if (require.main === module) {
  start();
}
