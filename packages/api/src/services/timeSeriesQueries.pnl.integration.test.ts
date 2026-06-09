/**
 * Integration test for queryAccountPnl's claim cost-basis math.
 *
 * Unlike the sibling unit test (which mocks $queryRaw and can only assert on the
 * SQL string), this seeds a real Postgres schema and runs the actual production
 * query, so it proves the *numbers* — in particular that a holder who redeems
 * the same (pickConfig, side) across several UNEQUAL claims has the staked cost
 * basis allocated in proportion to the tokens each claim redeemed, not split
 * evenly. The even-split version this replaced would fail these assertions.
 *
 * Requires a reachable Postgres (TEST_DATABASE_URL or a local server on :5432).
 * Skips cleanly when none is available so it never breaks CI without a DB.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import { queryAccountPnl } from './timeSeriesQueries';
import { TimeInterval } from './timeSeriesTypes';

const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.PNL_TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/postgres';

const SCHEMA = `pnl_it_${process.pid}_${Date.now()}`;

const HOLDER_PROP = '0xaaaa000000000000000000000000000000000001';
const HOLDER_ZERO = '0xbbbb000000000000000000000000000000000002';

// Minimal slices of the tables the PnL query touches. Close/position exist only
// so the UNION branches resolve; they stay empty for this test.
const DDL = `
  CREATE TABLE "Picks" (id text PRIMARY KEY, "predictorToken" text, "counterpartyToken" text);
  CREATE TABLE "Prediction" ("pickConfigId" text, predictor text, "predictorCollateral" text, counterparty text, "counterpartyCollateral" text);
  CREATE TABLE "Claim" (holder text, "redeemedAt" integer, "collateralPaid" text, "tokensBurned" text, "predictionId" text, "positionToken" text);
  CREATE TABLE "Close" ("burnedAt" integer, "predictorHolder" text, "predictorPayout" text, "predictorTokensBurned" text, "counterpartyHolder" text, "counterpartyPayout" text, "counterpartyTokensBurned" text);
  CREATE TABLE "position" (predictor text, "predictorWon" boolean, "totalCollateral" text, "predictorCollateral" text, counterparty text, "counterpartyCollateral" text, "settledAt" integer);
`;

const day = (d: number) => Math.floor(Date.UTC(2026, 0, d, 12, 0, 0) / 1000);

// ── Setup runs at top-level await so `dbAvailable` is known before `describe`
//    is evaluated (vitest resolves describe.skipIf at collection time). ──
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
    // Pin search_path at the connection level so BOTH the DDL/seeding and the
    // production query's unqualified table names resolve to our isolated schema.
    // (The adapter's { schema } option only affects Prisma-generated queries,
    // not raw SQL.) SCHEMA is a safe unquoted identifier (lowercase + digits).
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

    // Scenario A — proportional allocation across unequal claims in different
    // buckets. Stake 100 (predictor side); redeem 10 tokens (paid 30) then
    // 90 tokens (paid 270).
    await client.$executeRawUnsafe(
      `INSERT INTO "Picks" (id, "predictorToken", "counterpartyToken") VALUES ('pcA', 'ptokA', 'ctokA')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction" ("pickConfigId", predictor, "predictorCollateral", counterparty, "counterpartyCollateral")
       VALUES ('pcA', '${HOLDER_PROP}', '100', '0xother', '0')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "predictionId", "positionToken") VALUES
         ('${HOLDER_PROP}', ${day(2)}, '30',  '10', 'pcA', 'ptokA'),
         ('${HOLDER_PROP}', ${day(5)}, '270', '90', 'pcA', 'ptokA')`
    );

    // Scenario B — divide-by-zero guard: a claim with 0 tokensBurned must not
    // yield NULL/garbage; basis falls back to 0 so pnl = collateralPaid.
    await client.$executeRawUnsafe(
      `INSERT INTO "Picks" (id, "predictorToken", "counterpartyToken") VALUES ('pcB', 'ptokB', 'ctokB')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction" ("pickConfigId", predictor, "predictorCollateral", counterparty, "counterpartyCollateral")
       VALUES ('pcB', '${HOLDER_ZERO}', '50', '0xother', '0')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "predictionId", "positionToken") VALUES
         ('${HOLDER_ZERO}', ${day(3)}, '5', '0', 'pcB', 'ptokB')`
    );
  }
}

afterAll(async () => {
  if (!client) return;
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.$disconnect();
});

describe.skipIf(!dbAvailable)('queryAccountPnl (integration: real SQL)', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-08T00:00:00Z');

  it('allocates cost basis proportionally to tokens redeemed, across buckets', async () => {
    const points = await queryAccountPnl(
      HOLDER_PROP,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    const nonzero = points
      .filter((p) => Number(p.pnl) !== 0)
      .map((p) => Number(p.pnl));

    // proportional: 30 - 100*(10/100)=20 ; 270 - 100*(90/100)=180
    // (even split would have been 30-50=-20 and 270-50=220)
    expect(nonzero).toEqual([20, 180]);

    // cost basis is conserved: total pnl = proceeds(300) - stake(100)
    expect(Number(points[points.length - 1].cumulativePnl)).toBe(200);
  });

  it('guards divide-by-zero when a claim redeemed zero tokens', async () => {
    const points = await queryAccountPnl(
      HOLDER_ZERO,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    const nonzero = points
      .filter((p) => Number(p.pnl) !== 0)
      .map((p) => Number(p.pnl));

    // basis falls back to 0, so pnl = collateralPaid = 5 (not 5 - 50)
    expect(nonzero).toEqual([5]);
  });
});
