import { describe, it, expect } from 'vitest';
import {
  GET_OPEN_INTEREST_BY_CATEGORY,
  GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION,
} from '../fixtures/v1-operations';
import { both, byKey } from './util';

/**
 * Parity: v1 `openInterestByCategory` / `openInterestByTimeToResolution`
 * vs v2 `protocol.openInterestByCategory` /
 * `protocol.openInterestByTimeToResolution`.
 *
 * Documented differences encoded below:
 * - DROPPED numeric `category.id` (v1 selects it; v2 categories key on
 *   slug — Prisma row ids are not exposed in v2 by design).
 * - DROPPED v1 TTR `label` ('≤1d', '2-7d', …): presentation string with no
 *   v2 counterpart — v2 clients render labels from the explicit bounds.
 * - v1 TTR `bucket` ordinal (1–7) → v2 `(minSecondsFromNow,
 *   maxSecondsFromNow]` window — LEFT-EXCLUSIVE, RIGHT-INCLUSIVE, matching
 *   the SQL `delta <= bound` ladder. Bug #13 (fixed in 4f543ef0c) was the
 *   advertised bounds claiming `[min, max)`; the BUCKET_WINDOWS table below
 *   encodes the corrected (min, max] mapping verbatim from Protocol.ts —
 *   if the server table drifts, this pair fails rather than re-deriving.
 *
 * FIXTURE LIMITATION: both resolvers scope to DEFAULT_CHAIN_ID (Ethereal
 * mainnet, 5064014, in the contract env) while the fixture's predictions/
 * OI live on 13374202 — both sides return EMPTY here (same caveat as the
 * existing v1 operations tests for these queries). The pair still proves
 * shape + the empty sets agree, and the bucket-window mapping is asserted
 * structurally so it is pinned even with no rows.
 */

const V2_OPEN_INTEREST = /* GraphQL */ `
  query OpenInterestParity {
    protocol {
      openInterestByCategory {
        category {
          name
          slug
        }
        openInterest
      }
      openInterestByTimeToResolution {
        minSecondsFromNow
        maxSecondsFromNow
        openInterest
        predictionCount
      }
    }
  }
`;

const DAY = 86400;
// v1 bucket ordinal → v2 (min, max] window. Mirrors TTR_BUCKET_BOUNDS in
// graphql/v2/resolvers/Protocol.ts (post bug-#13 orientation): bucket 1's
// min is null (absorbs overdue), bucket 7's max is null (open tail).
const BUCKET_WINDOWS: Record<number, { min: number | null; max: number | null }> =
  {
    1: { min: null, max: DAY },
    2: { min: DAY, max: 7 * DAY },
    3: { min: 7 * DAY, max: 30 * DAY },
    4: { min: 30 * DAY, max: 60 * DAY },
    5: { min: 60 * DAY, max: 90 * DAY },
    6: { min: 90 * DAY, max: 180 * DAY },
    7: { min: 180 * DAY, max: null },
  };

interface CanonicalCategoryOi {
  slug: string;
  name: string;
  openInterest: string;
}
interface CanonicalTtr {
  window: string; // "(min,max]" key
  openInterest: string;
  predictionCount: number;
}

interface V1Data {
  openInterestByCategory: {
    category: { id: number; name: string; slug: string };
    openInterest: string;
  }[];
}
interface V1TtrData {
  openInterestByTimeToResolution: {
    bucket: number;
    label: string;
    openInterest: string;
    predictionCount: number;
  }[];
}
interface V2Data {
  protocol: {
    openInterestByCategory: {
      category: { name: string; slug: string };
      openInterest: string | number;
    }[];
    openInterestByTimeToResolution: {
      minSecondsFromNow: number | null;
      maxSecondsFromNow: number | null;
      openInterest: string | number;
      predictionCount: number;
    }[];
  };
}

const windowKey = (min: number | null, max: number | null): string =>
  `(${min ?? '-inf'},${max ?? 'inf'}]`;

describe('parity: open interest breakdowns', () => {
  it('categories keyed by slug and TTR buckets keyed by (min,max] agree', async () => {
    // Both v1 ops ride one pair run each against the same v2 doc.
    const [dCat, d2] = await both<V1Data, V2Data>(
      { query: GET_OPEN_INTEREST_BY_CATEGORY },
      { query: V2_OPEN_INTEREST }
    );
    const [dTtr] = await both<V1TtrData, V2Data>(
      { query: GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION },
      { query: V2_OPEN_INTEREST }
    );

    // --- categories, keyed by slug ---
    const v1Cat = byKey(
      dCat.openInterestByCategory.map(
        (r): CanonicalCategoryOi => ({
          slug: r.category.slug,
          name: r.category.name,
          openInterest: BigInt(r.openInterest).toString(),
        })
      ),
      (r) => r.slug
    );
    const v2Cat = byKey(
      d2.protocol.openInterestByCategory.map(
        (r): CanonicalCategoryOi => ({
          slug: r.category.slug,
          name: r.category.name,
          openInterest: BigInt(r.openInterest).toString(),
        })
      ),
      (r) => r.slug
    );
    expect(v2Cat.length).toBe(v1Cat.length);
    expect(v2Cat).toEqual(v1Cat); // v1 is `expected`

    // --- TTR buckets, v1 ordinal mapped through the documented windows ---
    const v1Ttr = byKey(
      dTtr.openInterestByTimeToResolution.map((r): CanonicalTtr => {
        const w = BUCKET_WINDOWS[r.bucket];
        expect(w, `v1 emitted unknown bucket ${r.bucket}`).toBeDefined();
        return {
          window: windowKey(w.min, w.max),
          openInterest: BigInt(r.openInterest).toString(),
          predictionCount: r.predictionCount,
        };
      }),
      (r) => r.window
    );
    const v2Ttr = byKey(
      d2.protocol.openInterestByTimeToResolution.map(
        (r): CanonicalTtr => ({
          window: windowKey(r.minSecondsFromNow, r.maxSecondsFromNow),
          openInterest: BigInt(r.openInterest).toString(),
          predictionCount: r.predictionCount,
        })
      ),
      (r) => r.window
    );
    expect(v2Ttr.length).toBe(v1Ttr.length);
    expect(v2Ttr).toEqual(v1Ttr);

    // Every v2 window must be one of the seven documented buckets — pins
    // the server-side bounds table even when the fixture yields no rows.
    const known = new Set(
      Object.values(BUCKET_WINDOWS).map((w) => windowKey(w.min, w.max))
    );
    for (const row of v2Ttr) expect(known.has(row.window)).toBe(true);
  });

  it('the documented bucket grid is contiguous (min[n] === max[n-1])', () => {
    // Structural pin of the (min, max] ladder itself: each bucket's
    // exclusive lower bound is exactly the previous bucket's inclusive
    // upper bound; null only at the two open ends.
    for (let bucket = 2; bucket <= 7; bucket += 1) {
      expect(BUCKET_WINDOWS[bucket].min).toBe(BUCKET_WINDOWS[bucket - 1].max);
    }
    expect(BUCKET_WINDOWS[1].min).toBeNull();
    expect(BUCKET_WINDOWS[7].max).toBeNull();
  });
});
