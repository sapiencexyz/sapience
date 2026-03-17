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
  - `packages/market-keeper` – Cron scripts for managing Sapience conditions from Polymarket markets.
- Backend services deploy on Railway with per-service build/start commands (see `railway.toml` and the Railway dashboard).

## Core Commands

Run from repo root unless noted.

```bash
pnpm install                 # install all workspace dependencies (dev + prod)
pnpm run dev:app             # start product app on http://localhost:3000
pnpm run dev:api             # start GraphQL API + worker + codegen (requires Postgres)
pnpm run dev:docs            # Vocs docs on http://localhost:3003
pnpm run test --recursive    # run package tests (delegates to package scripts)
```

Package-specific highlights:

- Protocol: `pnpm --filter protocol run test` (Forge).
- API: `pnpm --filter @sapience/api run prisma:setup` before local runs; use `vitest` (`test`/`test:watch`) and `tsx` CLIs (e.g., `start:reindex-*`).
- SDK: build with `pnpm --filter @sapience/sdk run build:lib`; Storybook lives at `packages/sdk`.
- App: standard Next.js commands (`dev`, `build`, `lint`, `type-check`).

## Environment Notes

- Services expect a Postgres connection string in `DATABASE_URL` (see `railway.toml` and the Railway dashboard for deployment wiring).
- Sentry is integrated across app/API; ensure auth tokens are available when building with sourcemap uploads.
- The API relies on generated Prisma client and GraphQL types (`prisma:generate`, `generate-types`). These run automatically in most scripts but double-check when editing schemas.

## CI Requirements

CI uses path-filtered jobs — only packages with changed files are checked. All checks must pass before merge.

- **API** (`packages/api`): lint, type-check, compile, vitest
- **App** (`packages/app`): lint, type-check, vitest
- **SDK** (`packages/sdk`): build, lint, type-check, vitest
- **UI** (`packages/ui`): lint, type-check
- **Relayer** (`packages/relayer`): lint, type-check, vitest
- **Protocol** (`packages/protocol`): `forge fmt --check`, contract tests

SDK changes also trigger API, App, and Relayer checks (they depend on it). UI changes trigger App checks.

### Dependency chain

```
protocol (standalone — Foundry)
sdk (standalone — tsup)
  ├── api (depends on sdk)
  ├── app (depends on sdk + ui)
  └── relayer (depends on sdk)
ui (standalone)
  └── app (depends on ui)
```

## Standardized Scripts

Every TypeScript package supports these scripts (run via `pnpm --filter <package> run <script>`):

| Script         | Description                   |
| -------------- | ----------------------------- |
| `lint`         | ESLint check                  |
| `lint:fix`     | ESLint auto-fix + format      |
| `type-check`   | `tsc --noEmit`                |
| `format`       | Prettier write                |
| `format:check` | Prettier check (CI-safe)      |
| `test`         | Unit tests (where applicable) |

Prettier config is shared at the repo root (`.prettierrc.json`). ESLint configs are per-package (different plugins per environment).

Quick local check (runs everything):

```bash
pnpm run check    # builds SDK, generates Prisma, lints all, typechecks all, tests all
```

## Regenerating GraphQL Types

After changing any GraphQL resolver (args, fields, types), run:

```bash
pnpm --filter @sapience/api run generate-types
```

This runs three steps in sequence: `prisma:generate` → `emit-schema` (writes `schema.graphql`) → `graphql-codegen` (writes `packages/sdk/types/graphql.ts`). No database connection is needed — config and Prisma are lazily initialized so build-time scripts can import resolvers without triggering env validation.

If you also changed SDK types, rebuild the SDK afterward:

```bash
pnpm --filter @sapience/sdk run build:lib
```

## Testing & Quality

### Test-Driven Development

Write tests before implementation. When adding or changing behavior:

1. Write a failing test that captures the expected behavior
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

When fixing a bug, first write a test that reproduces it, then fix the code.

### General Guidelines

- Prefer package-level lint/format commands (`lint`, `lint:fix`, `format`) instead of manual `eslint` invocations.
- For contract work, use Foundry's targeted flags (`forge test --match-path …`).
- All TypeScript packages use vitest for tests. Always build the SDK before running tests in app, api, or relayer — they import from SDK dist files and will fail with Vite transform errors otherwise.
- Keep Storybook snapshots current when touching shared UI (`pnpm --filter @sapience/ui run build-storybook`).

## Deployment & Ops

- Backend services are deployed on Railway (see `railway.toml`). Two environments exist: **testing** (deploys from a WIP branch) and **production** (deploys from `main`). Each service has its own build and start commands configured in the Railway dashboard.
- Contracts deploy via Forge scripts targeting Ethereal/Arbitrum.

## Agent Tips

- Check for package-local docs (e.g., `packages/protocol/CLAUDE.md`) before duplicating guidance.
- Respect existing formatting tools (Prettier, Forge fmt, etc.) and run relevant checks before submitting changes.
- When adding new scripts or workflows, update this file and any package-specific READMEs to keep automated collaboration smooth.
- schema.graphql and graphql.ts files are read-only and should be generated using bash commands, never edited directly.
