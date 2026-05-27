export interface BingoCondition {
  id: string;
  /** On-chain condition resolver contract address. */
  resolver: `0x${string}`;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  estimatedPrice: number;
  groupName?: string | null;
  similarMarketImage?: string | null;
}

/** Minimal display info for a single on-chain conditionId. */
export interface BingoConditionDetail {
  id: string;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  similarMarketImage?: string | null;
}

const GRAPHQL_ENDPOINT = 'https://api.sapience.xyz/graphql';

// Pulls a pool of in-flight markets sorted by soonest end time. Same shape
// as the production /app QuestionsTable query, trimmed to the fields a
// bingo cell needs.
const QUERY = /* GraphQL */ `
  query BingoPool(
    $take: Int!
    $minEstimatedPrice: Float
    $maxEstimatedPrice: Float
    $minEndTime: Int
  ) {
    questions(
      take: $take
      skip: 0
      sortField: endTime
      sortDirection: asc
      minEstimatedPrice: $minEstimatedPrice
      maxEstimatedPrice: $maxEstimatedPrice
      minEndTime: $minEndTime
      resolutionStatus: unresolved
    ) {
      questionType
      group {
        id
        name
        conditions {
          id
          resolver
          question
          shortName
          optionName
          estimatedPrice
          similarMarketImage
          settled
        }
      }
      condition {
        id
        resolver
        question
        shortName
        estimatedPrice
        similarMarketImage
        settled
      }
    }
  }
`;

interface RawCondition {
  id: string;
  resolver?: string | null;
  question: string;
  shortName?: string | null;
  optionName?: string | null;
  estimatedPrice?: number | null;
  settled?: boolean | null;
  similarMarketImage?: string | null;
}

interface RawGroup {
  id: string;
  name: string;
  conditions: RawCondition[];
}

interface RawQuestion {
  questionType: 'group' | 'condition';
  group?: RawGroup | null;
  condition?: RawCondition | null;
}

interface GqlResponse {
  data?: { questions?: RawQuestion[] };
  errors?: Array<{ message: string }>;
}

export interface FetchPoolOptions {
  /** Server-side cap. Default 128. */
  take?: number;
  /** Inclusive lower bound on probability (0..1). Default 0.10. */
  minEstimatedPrice?: number;
  /** Inclusive upper bound on probability (0..1). Default 0.90. */
  maxEstimatedPrice?: number;
}

export async function fetchProductionPool(
  opts: FetchPoolOptions = {},
): Promise<BingoCondition[]> {
  const take = opts.take ?? 128;
  const minEstimatedPrice = opts.minEstimatedPrice ?? 0.1;
  const maxEstimatedPrice = opts.maxEstimatedPrice ?? 0.9;
  const minEndTime = Math.floor(Date.now() / 1000);

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: { take, minEstimatedPrice, maxEstimatedPrice, minEndTime },
    }),
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const body = (await res.json()) as GqlResponse;
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }

  const out: BingoCondition[] = [];
  const seen = new Set<string>();

  const push = (
    raw: RawCondition,
    group?: { name: string },
  ) => {
    if (raw.settled) return;
    if (raw.estimatedPrice == null) return;
    if (!raw.resolver) return;
    if (
      raw.estimatedPrice < minEstimatedPrice ||
      raw.estimatedPrice > maxEstimatedPrice
    ) {
      return;
    }
    if (seen.has(raw.id)) return;
    seen.add(raw.id);
    out.push({
      id: raw.id,
      resolver: raw.resolver as `0x${string}`,
      question: raw.question,
      shortName: raw.shortName ?? null,
      optionName: raw.optionName ?? null,
      estimatedPrice: raw.estimatedPrice,
      groupName: group?.name ?? null,
      similarMarketImage: raw.similarMarketImage ?? null,
    });
  };

  for (const q of body.data?.questions ?? []) {
    if (q.questionType === 'condition' && q.condition) {
      push(q.condition);
    } else if (q.questionType === 'group' && q.group) {
      for (const c of q.group.conditions ?? []) {
        push(c, { name: q.group.name });
      }
    }
  }

  return out;
}

/**
 * Search-capable fetch for the admin pool editor.
 * Returns flat conditions only — group rows are flattened into their member
 * conditions. Honors a free-text search arg supported by the API's questions()
 * resolver.
 */
const SEARCH_QUERY = /* GraphQL */ `
  query BingoConditionSearch($take: Int!, $search: String) {
    questions(
      take: $take
      skip: 0
      sortField: endTime
      sortDirection: asc
      resolutionStatus: unresolved
      search: $search
    ) {
      questionType
      group {
        id
        name
        conditions {
          id
          resolver
          question
          shortName
          optionName
          estimatedPrice
          similarMarketImage
          settled
        }
      }
      condition {
        id
        resolver
        question
        shortName
        estimatedPrice
        similarMarketImage
        settled
      }
    }
  }
`;

export async function fetchConditions(opts: {
  search?: string;
  take?: number;
}): Promise<BingoCondition[]> {
  const take = Math.min(opts.take ?? 50, 100);
  const search = opts.search?.trim() || null;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { take, search },
    }),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as GqlResponse;
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }

  const out: BingoCondition[] = [];
  const seen = new Set<string>();
  const push = (raw: RawCondition, group?: { name: string }) => {
    if (raw.settled) return;
    if (!raw.resolver) return;
    if (raw.estimatedPrice == null) return;
    if (seen.has(raw.id)) return;
    seen.add(raw.id);
    out.push({
      id: raw.id,
      resolver: raw.resolver as `0x${string}`,
      question: raw.question,
      shortName: raw.shortName ?? null,
      optionName: raw.optionName ?? null,
      estimatedPrice: raw.estimatedPrice,
      groupName: group?.name ?? null,
      similarMarketImage: raw.similarMarketImage ?? null,
    });
  };

  for (const q of body.data?.questions ?? []) {
    if (q.questionType === 'condition' && q.condition) {
      push(q.condition);
    } else if (q.questionType === 'group' && q.group) {
      for (const c of q.group.conditions ?? []) push(c, { name: q.group.name });
    }
  }
  return out;
}

/**
 * Fetch condition display info by on-chain bytes32 ids. Used by the player
 * card to render images + questions for the 16 cells. Returns a map keyed by
 * lowercase id.
 */
const BY_IDS_QUERY = /* GraphQL */ `
  query BingoConditionsByIds($ids: [String!]!) {
    conditions(take: 100, where: { id: { in: $ids } }) {
      id
      question
      shortName
      optionName
      similarMarketImage
    }
  }
`;

export async function fetchConditionsByIds(
  ids: string[],
): Promise<Map<string, BingoConditionDetail>> {
  const out = new Map<string, BingoConditionDetail>();
  const lower = Array.from(new Set(ids.map((i) => i.toLowerCase()))).filter(
    (i) => /^0x[0-9a-f]{64}$/.test(i),
  );
  if (lower.length === 0) return out;

  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: BY_IDS_QUERY, variables: { ids: lower } }),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as {
    data?: { conditions?: RawCondition[] };
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join('; '));
  }
  for (const c of body.data?.conditions ?? []) {
    out.set(c.id.toLowerCase(), {
      id: c.id,
      question: c.question,
      shortName: c.shortName ?? null,
      optionName: c.optionName ?? null,
      similarMarketImage: c.similarMarketImage ?? null,
    });
  }
  return out;
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}
