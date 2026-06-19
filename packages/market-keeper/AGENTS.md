# Market Keeper Agents Guide

## Development Guidelines

1. For each new script, you should add the following check: if we aren't in production & pointing to the api.sapience.xyz, we should ask for user input to confirm that this is what we intend to do.

2. Look at the sibling folders in case there is anything you need to know about the structure of the Sapience API that you can't find here.

## Overview

Manages Sapience conditions sourced from external markets, plus the settlement pipeline that resolves them on-chain:

- **Generate**: Fetches Polymarket markets settling within 21 days, enriches them, submits to the Sapience API.
- **Relist**: Fetches markets with past end dates still traded on Polymarket, creates/extends conditions with `endTime = now + 7 days`.
- **Refresh metadata / volume / prices**: Periodic updates to existing conditions.
- **Cleanup**: Closes conditions that no longer track an active Polymarket market.
- **Settle**: Three resolution paths run as separate scripts — `settle-polymarket` (bridges resolution data from Polymarket via LayerZero), `settle-pyth` (Pyth oracle settlement), `settle-manual` (admin-resolved).

## Commands

Most operational scripts have dry-run variants; settlement/cleanup scripts have execute variants. See `package.json` for the exact script list. Examples:

```bash
# Ingestion
pnpm --filter @sapience/market-keeper generate:dry-run
pnpm --filter @sapience/market-keeper generate
pnpm --filter @sapience/market-keeper relist

# Settlement (per resolver type)
pnpm --filter @sapience/market-keeper settle-polymarket:dry-run
pnpm --filter @sapience/market-keeper settle-polymarket:execute:wait
pnpm --filter @sapience/market-keeper settle-pyth:execute:wait
pnpm --filter @sapience/market-keeper settle-manual:execute:wait

# Maintenance
pnpm --filter @sapience/market-keeper refresh-metadata
pnpm --filter @sapience/market-keeper refresh-volume
pnpm --filter @sapience/market-keeper cleanup-polymarket:execute

# Run the full pipeline (refresh → generate → relist → volume → cleanup → settle)
pnpm --filter @sapience/market-keeper start
```

The `start` script orchestrates `refresh-metadata → generate → relist → prices-and-1d-7d-volume → refresh-volume → cleanup-polymarket → settle-polymarket/manual → settle-pyth`; `scripts/start.js` is the source of truth for ordering. Settlement script selection is chain-dependent — mainnet (`5064014`) runs `settle-polymarket`, testnet runs `settle-manual`.

## Discord alerts

Set `DISCORD_KEEPER_WEBHOOK` (in the keeper's env, not just the API's) to enable two notification flows; with it unset both are silent no-ops.

- **Per-cron run summaries.** The cron runner (`scripts/lib/groups.js`) posts one embed per group run (discovery / metadata-tags / market-data / settlement) with each subservice's ✅/❌ status, duration, and counts. Counts come from subservices appending a JSON line via `emitStepSummary()` (`src/notify/summary.ts`) to the `KEEPER_SUMMARY_FILE` the runner provisions per run. Set `KEEPER_SUMMARY_ON_FAILURE_ONLY=1` to suppress success summaries.
- **Balance heartbeat.** `pnpm start:status` (`scripts/keeper-status.ts`, run as its own cron, e.g. hourly) reports OpenRouter credits + admin-wallet POL, escalating to a LOW alert below `OPENROUTER_MIN_CREDITS` / `ADMIN_MIN_POL`.

All notification logic lives in `src/notify/` (compiled to dist); the source-JS runner reaches it only through the single `dist/src/notify/report` entry point.

## Environment Variables

- `ADMIN_PRIVATE_KEY` - Private key for API auth and settlements
- `SAPIENCE_API_URL` - API URL (default: https://api.sapience.xyz)
- `POLYGON_RPC_URL` - Polygon RPC for reading Polymarket state
- `LLM_ENABLED` - Enable LLM enrichment (optional)
- `OPENROUTER_API_KEY` - OpenRouter key if LLM enabled
- `LLM_MODEL` - Model to use (default: openai/gpt-4o-mini)
- `DISCORD_KEEPER_WEBHOOK` - Discord webhook for keeper alerts (heartbeat + run summaries); unset = disabled
- `OPENROUTER_MIN_CREDITS` - LOW-alert threshold for OpenRouter USD credits (default 10)
- `ADMIN_MIN_POL` - LOW-alert threshold for admin wallet POL (default 5)
- `KEEPER_SUMMARY_ON_FAILURE_ONLY` - set to `1` to only post run summaries on failure

## Production Safety

Scripts prompt for confirmation when pointing to production API without NODE_ENV=production.

## Agent Tips

1. For script changes, always test with --dry-run first
2. Filter logic is in src/generate/pipeline/filters/
3. Settlement requires POL in admin wallet for LayerZero fees (~0.65 POL each)
