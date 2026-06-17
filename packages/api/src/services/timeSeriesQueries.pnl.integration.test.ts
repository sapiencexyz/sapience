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
const HOLDER_PARTIAL = '0xcccc000000000000000000000000000000000003';

// Minimal slices of the tables the PnL query touches. Close/position exist only
// so the UNION branches resolve; they stay empty for this test.
const DDL = `
  CREATE TABLE "Picks" (id text PRIMARY KEY, "predictorToken" text, "counterpartyToken" text);
  CREATE TABLE "Prediction" ("pickConfigId" text, predictor text, "predictorCollateral" text, counterparty text, "counterpartyCollateral" text);
  CREATE TABLE "Claim" (holder text, "redeemedAt" integer, "collateralPaid" text, "tokensBurned" text, "pickConfigId" text, "positionToken" text);
  CREATE TABLE "Close" ("burnedAt" integer, "predictorHolder" text, "predictorPayout" text, "predictorTokensBurned" text, "counterpartyHolder" text, "counterpartyPayout" text, "counterpartyTokensBurned" text);
  CREATE TABLE "position" (predictor text, "predictorWon" boolean, "totalCollateral" text, "predictorCollateral" text, counterparty text, "counterpartyCollateral" text, "settledAt" integer);
  CREATE TABLE "secondary_trade" (buyer text, seller text, price text, token text, "tokenAmount" text, "executedAt" integer);
`;

const day = (d: number) => Math.floor(Date.UTC(2026, 0, d, 12, 0, 0) / 1000);
// A timestamp before the test window (window starts 2026-01-01), for the
// cumulative-baseline scenario.
const preWindow = Math.floor(Date.UTC(2025, 11, 20, 12, 0, 0) / 1000);

const HOLDER_SECONDARY = '0xdddd000000000000000000000000000000000004';
const HOLDER_BASELINE = '0xeeee000000000000000000000000000000000005';
// A mints a winning side then sells it to B before B redeems.
const HOLDER_SELLER = '0xffff000000000000000000000000000000000006';
const HOLDER_BUYER = '0x1111000000000000000000000000000000000007';

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
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "pickConfigId", "positionToken") VALUES
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
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "pickConfigId", "positionToken") VALUES
         ('${HOLDER_ZERO}', ${day(3)}, '5', '0', 'pcB', 'ptokB')`
    );

    // Scenario C — PARTIAL redemption. Holder stakes 20 (predictor) against an
    // 80 counterparty stake, so totalCollateral = 100 and they are minted 100
    // predictor tokens (each token is a 1:1 claim on collateral). They redeem
    // only 50 of those 100 tokens. Cost basis must be allocated against the
    // TOTAL MINTED (100), not the total burned (50): basis = 20 * 50/100 = 10,
    // so pnl = 60 - 10 = 50. The total-burned denominator would wrongly book the
    // whole 20 stake on a half-exit (60 - 20 = 40).
    await client.$executeRawUnsafe(
      `INSERT INTO "Picks" (id, "predictorToken", "counterpartyToken") VALUES ('pcC', 'ptokC', 'ctokC')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction" ("pickConfigId", predictor, "predictorCollateral", counterparty, "counterpartyCollateral")
       VALUES ('pcC', '${HOLDER_PARTIAL}', '20', '0xother', '80')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "pickConfigId", "positionToken") VALUES
         ('${HOLDER_PARTIAL}', ${day(2)}, '60', '50', 'pcC', 'ptokC')`
    );

    // Scenario D — secondary-market PnL. Buys tokens for 40 (day 2, cost) then
    // sells for 100 (day 3, proceeds). Realized pnl = -40 then +100; the
    // settlement-only branches book nothing for this holder.
    await client.$executeRawUnsafe(
      `INSERT INTO "secondary_trade" (buyer, seller, price, "executedAt") VALUES
         ('${HOLDER_SECONDARY}', '0xother', '40',  ${day(2)}),
         ('0xother', '${HOLDER_SECONDARY}', '100', ${day(3)})`
    );

    // Scenario E — cumulative baseline. A sale of 30 settles BEFORE the window
    // (Dec 2025); a sale of 20 settles in-window (day 3). The in-window per-
    // bucket pnl must show only 20, but cumulativePnl must run from the 30
    // baseline → 50, proving the line doesn't reset at the window start.
    await client.$executeRawUnsafe(
      `INSERT INTO "secondary_trade" (buyer, seller, price, "executedAt") VALUES
         ('0xother', '${HOLDER_BASELINE}', '30', ${preWindow}),
         ('0xother', '${HOLDER_BASELINE}', '20', ${day(3)})`
    );

    // Scenario F — mint basis on a secondary SALE. A mints the predictor side
    // (stake 20, minted 100 tokens) of pcF, then sells all 100 tokens to B for
    // 60 on day(2), before B redeems for 100 on day(3). A never claims, so the
    // only place A's 20 stake can be booked is the sale: basis = 20 * 100/100.
    //   A: +60 sale − 20 basis              = +40
    //   B: −60 buy + 100 redeem (no basis)  = +40   (B isn't the minter)
    // Combined +80 (conserves); without the basis term A would read +60.
    await client.$executeRawUnsafe(
      `INSERT INTO "Picks" (id, "predictorToken", "counterpartyToken") VALUES ('pcF', 'ptokF', 'ctokF')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Prediction" ("pickConfigId", predictor, "predictorCollateral", counterparty, "counterpartyCollateral")
       VALUES ('pcF', '${HOLDER_SELLER}', '20', '0xother', '80')`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "secondary_trade" (buyer, seller, price, token, "tokenAmount", "executedAt")
       VALUES ('${HOLDER_BUYER}', '${HOLDER_SELLER}', '60', 'ptokF', '100', ${day(2)})`
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "Claim" (holder, "redeemedAt", "collateralPaid", "tokensBurned", "pickConfigId", "positionToken")
       VALUES ('${HOLDER_BUYER}', ${day(3)}, '100', '100', 'pcF', 'ptokF')`
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

  it('allocates basis against total minted, not total redeemed, on a partial exit', async () => {
    const points = await queryAccountPnl(
      HOLDER_PARTIAL,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    const nonzero = points
      .filter((p) => Number(p.pnl) !== 0)
      .map((p) => Number(p.pnl));

    // minted = predictorCollateral + counterpartyCollateral = 100; redeemed 50.
    // basis = stake(20) * 50/100 = 10 → pnl = 60 - 10 = 50.
    // (total-burned denominator would give 60 - 20*50/50 = 40.)
    expect(nonzero).toEqual([50]);
  });

  it('books secondary-market trades as cash flow (buy = cost, sell = proceeds)', async () => {
    const points = await queryAccountPnl(
      HOLDER_SECONDARY,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    const nonzero = points
      .filter((p) => Number(p.pnl) !== 0)
      .map((p) => Number(p.pnl));

    // buy 40 → -40 ; sell 100 → +100
    expect(nonzero).toEqual([-40, 100]);
    expect(Number(points[points.length - 1].cumulativePnl)).toBe(60);
  });

  it('seeds cumulativePnl from PnL realized before the window (no reset at the start)', async () => {
    const points = await queryAccountPnl(
      HOLDER_BASELINE,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    // Per-bucket pnl is window-local: only the in-window sale of 20 shows up;
    // the pre-window sale of 30 contributes to no bucket.
    const inWindow = points
      .filter((p) => Number(p.pnl) !== 0)
      .map((p) => Number(p.pnl));
    expect(inWindow).toEqual([20]);

    // But the running line starts from the 30 baseline, so every bucket — and
    // the final value — reflects 30 + 20 = 50.
    expect(Number(points[0].cumulativePnl)).toBe(30);
    expect(Number(points[points.length - 1].cumulativePnl)).toBe(50);
  });

  it('books mint basis on a secondary sale, so a seller who never redeems is not overstated', async () => {
    const seller = await queryAccountPnl(
      HOLDER_SELLER,
      TimeInterval.DAY,
      from,
      to,
      client
    );
    const buyer = await queryAccountPnl(
      HOLDER_BUYER,
      TimeInterval.DAY,
      from,
      to,
      client
    );

    // Seller: +60 sale − 20 mint basis (20 * 100/100) = 40. Without the basis
    // term this would read 60 (the pre-fix overstatement).
    expect(Number(seller[seller.length - 1].cumulativePnl)).toBe(40);
    // Buyer: −60 purchase + 100 redemption (no mint basis — not the minter) = 40.
    expect(Number(buyer[buyer.length - 1].cumulativePnl)).toBe(40);
    // Combined PnL conserves at +80 (true economic total).
    expect(
      Number(seller[seller.length - 1].cumulativePnl) +
        Number(buyer[buyer.length - 1].cumulativePnl)
    ).toBe(80);
  });
});
