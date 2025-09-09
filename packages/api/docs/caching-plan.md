## Caching and Precomputation Plan

### Goals

- Reduce latency and database load for profit/accuracy leaderboards and ranks.
- Ensure freshness with event-driven updates; provide periodic catch-up.
- Keep the design simple to operate and observable.

### High-level Architecture

- **Precomputed tables (primary):**
  - **attester_market_tw_error**: one row per (attester, market), stores horizon-weighted error (TW error).
  - **owner_market_realized_pnl**: one row per (chainId, marketGroupAddress, marketId, owner), stores realized PnL.
  - Updates are event-driven, idempotent upserts from workers or controller hooks.
- **API response caching:**
  - Existing `@cacheControl(maxAge: 60)` for resolvers.
- **In-memory TTL cache:**
  - Already implemented for per-attester summary and all-time leaderboard to protect DB for bursty traffic.
- **Synchronous periodic reconciliation (integrated with candle cache):**
  - After each candle build loop, scan new settlements/transfers using watermarks in `cache_param` and upsert aggregates.
- **Process orchestration & status (reuse candle cache pattern):**
  - Reuse the candle cache approach: DB-backed IPC via `cache_param`, status endpoints, and a process manager to run long tasks in background with single-active guard.
- **Admin/ops controls:**
  - Routes to trigger rebuilds and inspect status (similar to candle cache routes).

### Data Model Additions (Prisma)

- Add two models and indexes:
  - `AttesterMarketTwError`
    - Fields: `attester (String)`, `marketAddress (String)`, `marketId (Int)`, `twError (Float)`, `computedAt (DateTime @updatedAt)`
    - Constraints/Indexes:
      - `@@unique([attester, marketAddress, marketId])`
      - `@@index([attester])`
      - `@@index([marketAddress, marketId])`
  - `OwnerMarketRealizedPnl`
    - Fields: `chainId (Int)`, `address (String)`, `marketId (Int)`, `owner (String)`, `realizedPnl (Decimal)`, `updatedAt (DateTime @updatedAt)`
    - Constraints/Indexes:
      - `@@unique([chainId, address, marketId, owner])`
      - `@@index([owner])`
      - `@@index([chainId, address, marketId])`

Notes:
- Use `Decimal` for PnL to preserve precision.
- Normalize addresses and owners to lowercase upon write.

### Event-driven Updates

- Market settlement → update per-attester TW error for that (address, marketId):
  - Hook: `controllers/market.ts` in `EventType.MarketSettled` (fits next to `reindexAccuracy`).
  - Job: compute all attesters’ TW error for the settled market and upsert into `AttesterMarketTwError`.
  - Prefer background job (Render worker or detached process), fallback inline on failure.

- Collateral transfers / position settled → update realized PnL aggregates:
  - Primary: periodic reconciliation step reads new `collateral_transfer` rows since watermark and upserts `OwnerMarketRealizedPnl`.
  - Optional hooks (later): after `insertCollateralTransfer(...)` to enqueue targeted recompute for faster freshness.

### Resolver Changes (reads only)

- Accuracy
  - `topForecasters` / `accuracyRankByAddress`:
    - Replace per-attester compute with SQL aggregation over `AttesterMarketTwError`.
    - Accuracy score = `1 / avg(tw_error)` where avg is across settled markets for the attester.
  - Keep `@cacheControl(maxAge: 60)`.

- PnL
  - `getMarketLeaderboard` (per market): read from `OwnerMarketRealizedPnl` filtered by `(chainId, address, marketId)`.
  - `allTimeProfitLeaderboard` / `profitRankByAddress`: aggregate over `OwnerMarketRealizedPnl` grouped by owner.
  - Keep `@cacheControl(maxAge: 60)`.

### Admin/Ops

- Routes similar to `routes/refreshCache.ts`:
  - `POST /admin/precompute/rebuild/pnl?from=<ts>&to=<ts>`
  - `POST /admin/precompute/rebuild/accuracy?from=<ts>&to=<ts>`
  - `GET /admin/precompute/status` (surface watermarks and worker status)
  - Admin UI (mirror candle cache reindex): controls to trigger rebuilds and a status panel that polls `status` and shows watermarks/active state; disable actions while a process is active.
  - Routes and middleware parity: mount under `/admin/precompute` with `adminAuth`, mirroring `/admin/cache` in `src/routes/index.ts`.

### Implementation Steps

1) Schema & migrations
- Add the two models + indexes in `prisma/schema.prisma`.
- `pnpm --filter @foil/api prisma migrate dev --name precompute_tables`.

2) Writers (jobs)
- Create `src/workers/jobs/updateTwErrorForMarket.ts`:
  - Input: `(marketAddress, marketId)`
  - Compute TW error per attester for that market; upsert rows.
- Create `src/workers/jobs/updateRealizedPnlForKeys.ts`:
  - Input: array of keys `(chainId, address, marketId, owner)`
  - Recompute realized PnL deltas; upsert rows.

2b) Watermarks (cache_param)
- Add numeric params:
  - `pnl_lastProcessedCollateralTransferId` (or timestamp)
  - `accuracy_lastProcessedSettlementEventId` (or timestamp)

2c) Process/Status manager (reuse candle cache pattern)
- Create `src/precompute/precomputeProcessManager.ts` by copying `src/candle-cache/candleCacheProcessManager.ts`:
  - Rename IPC key to `precomputeRunnerStatus` (string param in `cache_param`).
  - Expose `startPrecomputeAll()` and `startPrecomputeRange({ from, to })` which call into the runner in a background tick.
  - Keep single-active-process guard and JSON status payload shape.
- Create `src/precompute/precomputeStatusManager.ts` by copying `src/candle-cache/candleCacheStatusManager.ts` to serve status for the runner.

3) Event hooks
- In `controllers/market.ts`:
  - On `MarketSettled`: enqueue `updateTwErrorForMarket` (Render job or detached process).
  - Optional: after `insertCollateralTransfer(...)` enqueue `updateRealizedPnlForKeys` for impacted keys (can defer).

4) Synchronous periodic reconciliation
- Integrate a `pnlAccuracyRunner.runOnce()` after `await candleCacheBuilder.buildCandles()` in the existing worker loop.
- The runner:
  - Reads watermarks from `cache_param`.
  - Scans new settlements/transfers; upserts to `AttesterMarketTwError` and `OwnerMarketRealizedPnl`.
  - Advances watermarks on success (idempotent).

4b) Routes (mirror candle cache refresh/status)
- Add `src/routes/precompute.ts` similar to `src/routes/refreshCache.ts`:
  - `GET /precompute/refresh` → `precomputeProcessManager.startPrecomputeAll()`.
  - `POST /precompute/refresh` with `{ from, to }` → range rebuild.
  - `GET /precompute-status` and `GET /precompute-status/all` → serve status via `precomputeStatusManager`.
- Wire in `src/routes/index.ts` as `adminRouter.use('/precompute', precomputeRoutes)` under `adminAuth`.

5) Resolvers (reads)
- Update `ScoreResolver` to read from `AttesterMarketTwError` (aggregate in SQL) instead of computing from `attestation_score`.
- Update `PnLResolver` to read from `OwnerMarketRealizedPnl` instead of per-market `MarketPnL` aggregation.
- Keep `@cacheControl(maxAge: 60)`.
5b) Admin UI (mirror candle cache reindex UI)
- Add an Admin tab with buttons: `Rebuild PnL` (optionally range-bounded) and `Rebuild Accuracy`.
- Poll `/admin/precompute/status` to display runner state and watermarks; disable buttons while active.
- Reuse auth and UX patterns from the candle cache UI for consistency.
6) Backfill & rollout
- Backfill scripts:
  - For TW error: iterate settled markets; compute per-attester; upsert.
  - For PnL: iterate markets with closed positions; upsert per owner.
- Deploy background worker (Render service) and ensure env vars/DB URL.
- Flip resolvers to read precomputed tables when backfill > 95% complete.

7) Observability & SLOs
- Metrics: job latency, rows processed, error counts, resolver latency p50/p95.
- Logs: per-batch processing with timings; watermark advancement.
- Alerts: repeated failures, watermark staleness beyond threshold.

### Performance & Correctness Notes

- Batch writes with `prisma.$transaction` (chunk ~500–1000 rows); use `$executeRaw` upsert for large bulk updates.
- Ensure idempotency: unique constraints on keys; consistent lowercasing of addresses/owners.
- Use `Decimal` math for PnL; convert to string at API edge if needed.
- Favor the synchronous reconciler-after-candles approach for robustness without a separate scheduler.

### Testing

- Unit: job functions compute correct aggregates for contrived inputs.
- Integration: simulate settlement and transfers, verify resolver outputs change accordingly.
- Load: benchmark resolver latency before/after, ensure DB CPU/IO headroom.


