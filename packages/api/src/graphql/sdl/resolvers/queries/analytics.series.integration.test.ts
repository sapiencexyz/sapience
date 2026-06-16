/**
 * Integration test for `fetchProtocolSeriesAggregates` — the cumulative volume,
 * cumulative trade count, and point-in-time open-interest series that back the
 * /analytics charts.
 *
 * The sibling unit test mocks `$queryRaw` and so can only assert plumbing; this
 * seeds a real Postgres schema and runs the actual production SQL, proving the
 * *numbers*. It exists specifically to lock in that the running-sum rewrite
 * (which replaced a per-boundary triangular range-join) is numerically
 * identical to the old correlated-filter query — including the two subtle
 * boundary rules:
 *   • cumulative metrics include events landing *exactly on* a boundary (`<=`);
 *   • open interest *releases* collateral for a prediction that settles exactly
 *     on a boundary (old `settled > T` open condition → excluded at T).
 *
 * Requires a reachable Postgres (TEST_DATABASE_URL or a local server on :5432).
 * Skips cleanly when none is available so it never breaks CI without a DB.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../../generated/prisma';
import { fetchProtocolSeriesAggregates } from './analytics';

const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/postgres';

const SCHEMA = `analytics_series_it_${process.pid}_${Date.now()}`;

const CHAIN = 8453;
const OTHER_CHAIN = 9999;

// Minimal slices of the tables the series SQL touches. Collateral/price stay
// text (the production columns are stringified wei); timestamps are bigint
// epoch seconds.
const DDL = `
  CREATE TABLE "position" ("mintedAt" bigint, "totalCollateral" text, "chainId" integer);
  CREATE TABLE "Prediction" ("onChainCreatedAt" bigint, "predictorCollateral" text, "counterpartyCollateral" text, "chainId" integer, "pickConfigId" text);
  CREATE TABLE "secondary_trade" ("executedAt" bigint, price text, "chainId" integer);
  CREATE TABLE "Picks" (id text PRIMARY KEY, "resolvedAt" bigint);
`;

let client: PrismaClient | undefined;
let dbAvailable = false;

{
  const probe = new PrismaClient({
    adapter: new PrismaPg({ connectionString: BASE_URL }),
  });
  try {
    await probe.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  } finally {
    await probe.$disconnect();
  }

  if (dbAvailable) {
    // Pin search_path so both the DDL/seeding AND the production query's
    // unqualified table names resolve to this isolated schema. SCHEMA is a safe
    // unquoted identifier (lowercase + digits + underscore).
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: BASE_URL,
        options: `-c search_path=${SCHEMA}`,
      }),
    });

    for (const stmt of DDL.split(';')
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.$executeRawUnsafe(stmt);
    }

    // ── Seed (timestamps in epoch seconds; boundaries probed at 1000..4000) ──
    // Predictions: +collateral at creation, −collateral at settlement.
    //   P1 created@1000 (100), settles@3000
    //   P2 created@2000 (100), never settles
    //   P3 created@2000 (100), settles@2000  (created & settled on same boundary)
    await client.$executeRawUnsafe(`
      INSERT INTO "Picks" (id, "resolvedAt") VALUES
        ('pc1', 3000),
        ('pc2', NULL),
        ('pc3', 2000)
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "Prediction" ("onChainCreatedAt", "predictorCollateral", "counterpartyCollateral", "chainId", "pickConfigId") VALUES
        (1000, '40', '60', ${CHAIN}, 'pc1'),
        (2000, '50', '50', ${CHAIN}, 'pc2'),
        (2000, '30', '70', ${CHAIN}, 'pc3')
    `);
    // positions: one on-chain @1000 (100); one on a DIFFERENT chain that must
    // be filtered out of every metric.
    await client.$executeRawUnsafe(`
      INSERT INTO "position" ("mintedAt", "totalCollateral", "chainId") VALUES
        (1000, '100', ${CHAIN}),
        (3000, '200', ${OTHER_CHAIN})
    `);
    // secondary trade @2000 (50).
    await client.$executeRawUnsafe(`
      INSERT INTO secondary_trade ("executedAt", price, "chainId") VALUES
        (2000, '50', ${CHAIN})
    `);
  }
}

afterAll(async () => {
  if (!client) return;
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.$disconnect();
});

describe.skipIf(!dbAvailable)(
  'fetchProtocolSeriesAggregates (integration: real SQL)',
  () => {
    const boundaries = [1000, 2000, 3000, 4000];

    it('computes cumulative volume, trade count and live open interest at each boundary', async () => {
      const { volumeMap, tradeCountMap, oiMap } =
        await fetchProtocolSeriesAggregates(boundaries, CHAIN, client!);

      // Cumulative VOLUME = Σ(position.totalCollateral + prediction collateral +
      // secondary price) created ≤ T. Wrong-chain position (200) excluded.
      //   T1000: pos1(100) + P1(100)                     = 200
      //   T2000: + P2(100) + P3(100) + st1(50)           = 450
      expect(volumeMap.get(1000)).toBe('200'); // inclusive at the boundary
      expect(volumeMap.get(2000)).toBe('450');
      expect(volumeMap.get(3000)).toBe('450');
      expect(volumeMap.get(4000)).toBe('450');

      // Cumulative TRADE COUNT = predictions + secondary trades created ≤ T
      // (positions are NOT trades).
      //   T1000: P1                       = 1
      //   T2000: P1,P2,P3,st1             = 4
      expect(tradeCountMap.get(1000)).toBe('1');
      expect(tradeCountMap.get(2000)).toBe('4');
      expect(tradeCountMap.get(3000)).toBe('4');
      expect(tradeCountMap.get(4000)).toBe('4');

      // OPEN INTEREST = Σ prediction collateral where created ≤ T AND not yet
      // settled at T.
      //   T1000: P1(+100)                                         = 100
      //   T2000: P1(100) + P2(100) + P3(+100−100 settled@2000)    = 200
      //   T3000: P1(settled@3000 → released) + P2(100) + P3(0)    = 100
      //   T4000: P2(100)                                          = 100
      expect(oiMap.get(1000)).toBe('100');
      expect(oiMap.get(2000)).toBe('200'); // P3 settling on the boundary releases
      expect(oiMap.get(3000)).toBe('100'); // P1 settling on the boundary releases
      expect(oiMap.get(4000)).toBe('100');
    });

    it('returns a row for every boundary even with no events on a chain', async () => {
      const { volumeMap, tradeCountMap, oiMap } =
        await fetchProtocolSeriesAggregates(boundaries, 123456, client!);

      for (const b of boundaries) {
        expect(volumeMap.get(b)).toBe('0');
        expect(tradeCountMap.get(b)).toBe('0');
        expect(oiMap.get(b)).toBe('0');
      }
    });
  }
);
