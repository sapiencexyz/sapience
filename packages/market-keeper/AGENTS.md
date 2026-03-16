# Market Keeper Agents Guide

## Development Guidelines

1. For each new script, you should add the following check: if we aren't in production & pointing to the api.sapience.xyz, we should ask for user input to confirm that this is what we intend to do.

2. Look at the sibling folders in case there is anything you need to know about the structure of the Sapience API that you can't find here.

## Overview

Manages Sapience conditions from Polymarket markets:

- **Generate**: Fetches markets settling within 21 days, submits to Sapience API
- **Relist**: Fetches markets with past end dates still traded on Polymarket, creates/extends conditions with endTime = now + 7 days
- **Settle**: Bridges resolution data from Polymarket via LayerZero

## Commands

```bash
pnpm --filter @sapience/market-keeper generate:dry-run  # Test generation
pnpm --filter @sapience/market-keeper generate          # Submit to API
pnpm --filter @sapience/market-keeper relist:dry-run     # Test relisting
pnpm --filter @sapience/market-keeper relist             # Relist to API
pnpm --filter @sapience/market-keeper settle:dry-run    # Check settlements
pnpm --filter @sapience/market-keeper settle:execute:wait  # Execute settlements
pnpm --filter @sapience/market-keeper start             # Run both
```

## Environment Variables

- `ADMIN_PRIVATE_KEY` - Private key for API auth and settlements
- `SAPIENCE_API_URL` - API URL (default: https://api.sapience.xyz)
- `POLYGON_RPC_URL` - Polygon RPC for reading Polymarket state
- `LLM_ENABLED` - Enable LLM enrichment (optional)
- `OPENROUTER_API_KEY` - OpenRouter key if LLM enabled
- `LLM_MODEL` - Model to use (default: openai/gpt-4o-mini)

## Production Safety

Scripts prompt for confirmation when pointing to production API without NODE_ENV=production.

## Agent Tips

1. For script changes, always test with --dry-run first
2. Filter logic is in src/generate/pipeline/filters/
3. Settlement requires POL in admin wallet for LayerZero fees (~0.65 POL each)
