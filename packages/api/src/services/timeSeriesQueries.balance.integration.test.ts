/**
 * Integration test for queryAccountBalance's claimable-collateral accounting.
 *
 * Unlike a mocked unit test (which can only assert on the SQL string), this
 * seeds a real Postgres schema and runs the actual production query, so it
 * proves the *numbers* — specifically that a settled position's claimable
 * collateral stops counting once the holder redeems that side, and that a
 * redemption of the OTHER side does not drop it (side is matched through the
 * pick configuration's predictor/counterparty token, the same way the PnL
 * query resolves it).
 *
 * The pre-fix query joined Claim.pickConfigId to Prediction.predictionId —
 * different identifier spaces — so the NOT EXISTS matched zero rows and
 * claimable was never decremented after a redeem.
 *
 * Requires a reachable Postgres (TEST_DATABASE_URL or a local server on :5432).
 * Skips cleanly when none is available so it never breaks CI without a DB.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma';
import { queryAccountBalance } from './timeSeriesQueries';
import { TimeInterval } from './timeSeriesTypes';

const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.PNL_TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/postgres';

const SCHEMA = `bal_it_${process.pid}_${Date.now()}`;

// Predictor who redeems their own (winning) side.
const HOLDER_REDEEMS = '0xaaaa000000000000000000000000000000000001';
// Predictor whose only claim is on the OTHER side — claimable must persist.
const HOLDER_OTHER_SIDE = '0xbbbb000000000000000000000000000000000002';
// Predictor who redeems only PART of a winning side — claimable must decrement
// by the redeemed amount, not drop to zero.
const HOLDER_PARTIAL_CLAIM = '0xcccc000000000000000000000000000000000003';

// Minimal slices of the tables queryAccountBalance touches. `position` (the V1
// legacy table) exists only so the all_deployed UNION branch resolves; it stays
// empty. Prediction carries both predictionId and pickConfigId so the DDL is
// valid against the pre-fix query too (proving the test fails before the fix).
const DDL = `
  CREATE TABLE "Picks" (id text PRIMARY KEY, "predictorToken" text, "counterpartyToken" text);
  CREATE TABLE "Prediction" (
    "predictionId" text, "pickConfigId" text, predictor text, counterparty text,
    "predictorCollateral" text, "counterpartyCollateral" text,
    "predictorClaimable" text, "counterpartyClaimable" text,
    "onChainCreatedAt" integer, "settledAt" integer
  );
  CREATE TABLE "Claim" (holder text, "pickConfigId" text, "positionToken" text, "redeemedAt" integer, "collateralPaid" text);
  CREATE TABLE "position" (
    predictor text, counterparty text, "predictorCollateral" text,
    "counterpartyCollateral" text, "mintedAt" integer, "settledAt" integer
  );
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

    await client.$executeRawUnsafe(
      `INSERT INTO "Picks" (id, "predictorToken", "counterpartyToken") VALUES
         ('pcA', 'ptokA', 'ctokA'),
         ('pcB', 'ptokB', 'ctokB'),
         ('pcC', 'ptokC', 'ctokC')`
    );

    // Scenario A — predictor with 100 claimable on a position settled day(2),
    // redeems their predictor token on day(4). Claimable must read 100 on
    // day(2)/day(3) and 0 from day(4).
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction"
         ("predictionId", "pickConfigId", predictor, counterparty,
          "predictorCollateral", "counterpartyCollateral",
          "predictorClaimable", "counterpartyClaimable",
          "onChainCreatedAt", "settledAt")
       VALUES
         ('pred-A', 'pcA', '${HOLDER_REDEEMS}', '0xother',
          '100', '0', '100', '0', ${day(1)}, ${day(1)})`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "pickConfigId", "positionToken", "redeemedAt", "collateralPaid")
       VALUES ('${HOLDER_REDEEMS}', 'pcA', 'ptokA', ${day(4)}, '100')`
    );

    // Scenario B — predictor with 50 claimable on a position settled day(2),
    // but the only claim is on the COUNTERPARTY token. Side mismatch → the
    // predictor's claimable must NOT be dropped.
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction"
         ("predictionId", "pickConfigId", predictor, counterparty,
          "predictorCollateral", "counterpartyCollateral",
          "predictorClaimable", "counterpartyClaimable",
          "onChainCreatedAt", "settledAt")
       VALUES
         ('pred-B', 'pcB', '${HOLDER_OTHER_SIDE}', '0xother',
          '50', '0', '50', '0', ${day(1)}, ${day(1)})`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "pickConfigId", "positionToken", "redeemedAt", "collateralPaid")
       VALUES ('${HOLDER_OTHER_SIDE}', 'pcB', 'ctokB', ${day(4)}, '50')`
    );

    // Scenario C — PARTIAL redemption. Predictor with 100 claimable settled
    // day(1), redeems only 40 of it on day(4). Remaining claimable must read
    // 100 through day(3) and 60 from day(5) — not 0.
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction"
         ("predictionId", "pickConfigId", predictor, counterparty,
          "predictorCollateral", "counterpartyCollateral",
          "predictorClaimable", "counterpartyClaimable",
          "onChainCreatedAt", "settledAt")
       VALUES
         ('pred-C', 'pcC', '${HOLDER_PARTIAL_CLAIM}', '0xother',
          '100', '0', '100', '0', ${day(1)}, ${day(1)})`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "pickConfigId", "positionToken", "redeemedAt", "collateralPaid")
       VALUES ('${HOLDER_PARTIAL_CLAIM}', 'pcC', 'ptokC', ${day(4)}, '40')`
    );
  }
}

afterAll(async () => {
  if (!client) return;
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.$disconnect();
});

describe.skipIf(!dbAvailable)(
  'queryAccountBalance (integration: real SQL)',
  () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-08T00:00:00Z');

    const claimableByDay = async (holder: string) => {
      const points = await queryAccountBalance(
        holder,
        TimeInterval.DAY,
        from,
        to,
        client
      );
      return new Map(
        points.map((p) => [
          new Date(p.timestamp * 1000).getUTCDate(),
          Number(p.claimableCollateral),
        ])
      );
    };

    it('decrements claimable collateral once the holder redeems that side', async () => {
      const byDay = await claimableByDay(HOLDER_REDEEMS);

      // Settled day(1): claimable is counted from the next bucket on.
      expect(byDay.get(2)).toBe(100);
      expect(byDay.get(3)).toBe(100);
      // Redeemed day(4) noon → drops from the day(5) bucket (the bug left it at
      // 100 forever because the join never matched).
      expect(byDay.get(5)).toBe(0);
      expect(byDay.get(6)).toBe(0);
    });

    it('does not decrement when only the other side was redeemed', async () => {
      const byDay = await claimableByDay(HOLDER_OTHER_SIDE);

      // A counterparty-token redemption must not clear a predictor-side claimable.
      expect(byDay.get(2)).toBe(50);
      expect(byDay.get(5)).toBe(50);
      expect(byDay.get(7)).toBe(50);
    });

    it('decrements by the redeemed amount on a partial redemption, not to zero', async () => {
      const byDay = await claimableByDay(HOLDER_PARTIAL_CLAIM);

      // 100 claimable, only 40 redeemed on day(4).
      expect(byDay.get(2)).toBe(100);
      expect(byDay.get(3)).toBe(100);
      // From day(5): 100 − 40 = 60 (the all-or-nothing bug reported 0 here).
      expect(byDay.get(5)).toBe(60);
      expect(byDay.get(7)).toBe(60);
    });
  }
);
