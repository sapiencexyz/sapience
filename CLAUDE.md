# CLAUDE.md

Sapience is a pnpm monorepo (Node ≥ 20.14, pnpm 9.x). Run `pnpm install` to set up.

**Packages:** `api` (TypeGraphQL + Prisma), `app` (Next.js 14), `sdk` (shared TS library), `ui` (component library), `relayer` (WebSocket service), `protocol` (Solidity/Foundry), `polymarket-keeper` (cron scripts), `docs` (Vocs).

**Starters:** `starters/market-maker` — a standalone auction market maker bot with pluggable pricing strategies. Has its own `CLAUDE.md`. Not part of the monorepo workspace; run independently from its directory.

For deeper context on a specific package, check for a package-level `AGENTS.md` and `CLAUDE.md` (e.g. `packages/api/AGENTS.md`).

## Quick local check
```bash
pnpm run check    # builds SDK, generates Prisma, lints all, typechecks all, tests all
```

Or check only what you touched:
```bash
pnpm --filter <package> run lint
pnpm --filter <package> run type-check
pnpm --filter <package> run test
pnpm --filter <package> run format:check
```

## Standardized scripts
Every TypeScript package supports these scripts (run via `pnpm --filter <package> run <script>`):

| Script | Description |
|---|---|
| `lint` | ESLint check |
| `lint:fix` | ESLint auto-fix + format |
| `type-check` | `tsc --noEmit` |
| `format` | Prettier write |
| `format:check` | Prettier check (CI-safe) |
| `test` | Unit tests (where applicable) |

Prettier config is shared at the repo root (`.prettierrc.json`). ESLint configs are per-package (different plugins per environment).

## Build order matters
1. `pnpm --filter @sapience/sdk run build:lib` — SDK must build first; app, api, and relayer import from it
2. `pnpm --filter @sapience/api run prisma:generate` — required before API compilation (generated client is not committed)

## Regenerating GraphQL types
After changing any GraphQL resolver (args, fields, types), run:
```bash
pnpm --filter @sapience/api run generate-types
```
This runs three steps in sequence: `prisma:generate` → `emit-schema` (writes `schema.graphql`) → `graphql-codegen` (writes `packages/sdk/types/graphql.ts`). No database connection is needed — config and Prisma are lazily initialized so build-time scripts can import resolvers without triggering env validation.

If you also changed SDK types, rebuild the SDK afterward:
```bash
pnpm --filter @sapience/sdk run build:lib
```

## Common footguns
- **SDK is a build dependency.** If you change SDK types, rebuild it before checking other packages.
- **`prisma:generate` before API compilation.** The generated Prisma client is not committed.
- **`schema.graphql` and `graphql.ts` are generated files** — never edit directly; run `generate-types` to regenerate.
- **Protocol tests need `forge build --ast`** before `forge test`. Use `pnpm --filter protocol run test` which handles this.
- **App uses Next.js** — `type-check` catches things `lint` doesn't and vice versa. Run both.
