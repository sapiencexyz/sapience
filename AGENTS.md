# Agents Guide

This document captures the context agents need when working in the Sapience monorepo. Keep it in sync as workflows evolve so future automation can ramp up quickly.

## Project Snapshot
- Workspace manager: `pnpm` (Node >= 20.14, pnpm 9.x). Install everything with `pnpm install`.
- Monorepo packages:
  - `packages/protocol` – Solidity smart contracts for the Sapience protocol (see `packages/protocol/CLAUDE.md` for a deeper contract-specific brief).
  - `packages/api` – TypeGraphQL + Prisma application with background workers, candle cache, and auction utilities.
  - `packages/app` – Next.js 14 product app consuming the SDK and API.
  - `packages/sdk` – Shared TypeScript SDK (ABIs, hooks, UI kit, GraphQL helpers) built via `tsup` and Storybook.
  - `packages/docs` – Documentation portal powered by Vocs.
- Shared script: `render-build-sdk.sh` installs workspace devDependencies and builds the SDK before deployment.

## Core Commands
Run from repo root unless noted.

```bash
pnpm install                 # install all workspace dependencies (dev + prod)
pnpm run dev:protocol        # launch Anvil + Cannon on 8545 with hot-deploys
pnpm run dev:app             # start product app on http://localhost:3000
pnpm run dev:api             # start GraphQL API + worker + codegen (requires Postgres)
pnpm run dev:docs            # Vocs docs on http://localhost:3003
pnpm run test --recursive    # run package tests (delegates to package scripts)
```

Package-specific highlights:
- Protocol: `pnpm --filter protocol run test` (Cannon + Forge), `pnpm --filter protocol run deploy:*` for network builds.
- API: `pnpm --filter @sapience/api run prisma:setup` before local runs; use `vitest` (`test`/`test:watch`) and `tsx` CLIs (e.g., `start:reindex-*`).
- SDK: build with `pnpm --filter @sapience/sdk run build:lib`; Storybook lives at `packages/sdk`.
- App: standard Next.js commands (`dev`, `build`, `lint`, `type-check`).

## Environment Notes
- Services expect a Postgres connection string in `DATABASE_URL` (see `render.yaml` for deployment wiring).
- Wallet interaction uses an Anvil chain on `http://localhost:8545` (Chain ID `13370`); reset the nonce when restarting the protocol node.
- Sentry is integrated across app/API; ensure auth tokens are available when building with sourcemap uploads.
- The API relies on generated Prisma client and GraphQL types (`prisma:generate`, `generate-types`). These run automatically in most scripts but double-check when editing schemas.

## Testing & Quality
- Prefer package-level lint/format commands (`lint`, `lint:fix`, `format`) instead of manual `eslint` invocations.
- For contract work, use Foundry’s targeted flags (`forge test --match-path …`).
- Frontend tests use Jest (`pnpm --filter @sapience/app run test`) and Playwright for E2E (`test:e2e`).
- Keep Storybook snapshots current when touching shared UI (`pnpm --filter @sapience/sdk run build-storybook`).

## Deployment & Ops
- Production is deployed on Render (see `render.yaml`): a web service for the API, worker processes, and a dedicated candle cache builder. Each build path runs `render-build-sdk.sh` to ensure the SDK is compiled first.
- Contracts deploy via Cannon (`deploy:*` scripts) targeting Sepolia/Base; dry runs available with `simulate-deploy:*`.

## Agent Tips
- Check for package-local docs (e.g., `packages/protocol/CLAUDE.md`) before duplicating guidance.
- Respect existing formatting tools (Prettier, Forge fmt, etc.) and run relevant checks before submitting changes.
- When adding new scripts or workflows, update this file and any package-specific READMEs to keep automated collaboration smooth.
- schema.graphql and graphql.ts files are read-only and should be generated using bash commands, never edited directly.