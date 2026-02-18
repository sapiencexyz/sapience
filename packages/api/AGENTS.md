# API Agents Guide

This note gives agents the key context needed when working inside `@sapience/api`.

## Overview
- GraphQL API built with TypeGraphQL (`schema.graphql` + resolvers in `src/`).
- Prisma ORM (`prisma/schema.prisma`) against Postgres (`DATABASE_URL` required).
- Background workers handle prediction market indexing, auctions, and Discord notifications.
- Depends on the shared SDK (`@sapience/sdk`) for contract types, ABIs, and GraphQL helpers.

## Core Commands
Run from repo root unless stated otherwise.

```bash
pnpm --filter @sapience/api install --prod=false  # ensure deps present (includes dev)
pnpm --filter @sapience/api run prisma:setup      # deploy migrations + generate client
pnpm run dev:api                                  # starts service, worker, and codegen with tsx watch
pnpm --filter @sapience/api run dev:service       # API server only (tsx watch src/server.ts)
pnpm --filter @sapience/api run dev:worker        # background worker (prediction market indexers)
pnpm --filter @sapience/api run generate-types    # GraphQL Codegen
pnpm --filter @sapience/api run compile           # lint, prisma generate, tsc
pnpm --filter @sapience/api run test              # vitest suite
pnpm --filter @sapience/api run test:watch        # vitest watch
```

Reindex/backfill helpers (`start:reindex-*`, `start:backfill-accuracy`) are CLIs run via `tsx src/workers/worker.ts …`.

## Environment & Tooling
- `.env` should provide `DATABASE_URL`. For local development copy `test-env.example` or configure manually.
- Codegen:
  - Prisma client: `prisma:generate` (auto-run in `prisma:setup` and most build scripts).
  - GraphQL types: `generate-types` (watch mode started in `dev:api`).
- Sentry sourcemaps: production build (`build`) invokes `sentry:sourcemaps`; ensure credentials are configured before running.
- Centralize environment variables in `src/config.ts` via the envalid-powered `config.*` exports. Never read from `process.env` directly in the codebase; add new vars to `config.ts` and consume them as `config.MY_ENV_VAR`.

## Folder Layout Highlights
- `src/server.ts` – Express/Apollo entrypoint.
- `src/workers/` – Background job runner, including `worker.ts` (prediction market and EAS indexing).
- `prisma/` – Schema, migrations, seeds (`prisma/seed.ts`).
- **Note**: Auction WebSocket service has been extracted to `packages/relayer` (package name: `@sapience/relayer`).
- `schema.graphql` – TypeGraphQL schema emitted for reference; do not edit manually.
- `codegen.ts` – GraphQL Code Generator configuration.

## Deployment
- Render configuration lives in `render.yaml`. The `web-service` entry deploys the API by installing pnpm 9, running `render-build-sdk.sh`, and starting `pnpm --filter @sapience/api start:service`.
- One Render worker supports background processing:
  - `background-worker` runs the same build steps, executes `pnpm --filter @sapience/api prisma:generate`, then starts `pnpm --filter @sapience/api start:worker`.
- All services share the managed Postgres instance (`DATABASE_URL` provided via Render environment variables) and deploy from the `main` branch of the GitHub repo.

## Agent Tips
- Run `prisma:setup` before tests or local servers to avoid missing migrations or generated clients.
- When editing GraphQL schema/resolvers, run `generate-types` to refresh TypeScript definitions used by consumers.
- Keep the SDK built (`pnpm --filter @sapience/sdk run build:lib`) if you modify shared types that the API depends on.
- Respect lint/format scripts (`lint`, `lint:fix`, `format`) rather than manual tooling to stay aligned with project standards.
