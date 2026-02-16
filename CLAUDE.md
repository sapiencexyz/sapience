# CLAUDE.md

Sapience is a pnpm monorepo (Node ≥ 20.14, pnpm 9.x). Run `pnpm install` to set up.

**Packages:** `api` (TypeGraphQL + Prisma), `app` (Next.js 14), `sdk` (shared TS library), `ui` (component library), `relayer` (WebSocket service), `protocol` (Solidity/Foundry), `polymarket-keeper` (cron scripts), `docs` (Vocs).

For deeper context on a specific package, check for a package-level `AGENTS.md` (e.g. `packages/api/AGENTS.md`).

## Quick local check
```bash
pnpm run check    # builds SDK, generates Prisma, lints all, typechecks all, tests all
```

Or check only what you touched:
```bash
pnpm --filter <package> run lint
pnpm --filter <package> run type-check
pnpm --filter <package> run test -- --run
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

## Common footguns
- **SDK is a build dependency.** If you change SDK types, rebuild it before checking other packages.
- **`prisma:generate` before API compilation.** The generated Prisma client is not committed.
- **`schema.graphql` and `graphql.ts` are generated files** — never edit directly, use bash commands to regenerate.
- **Protocol tests need `forge build --ast`** before `cannon test`. Use `pnpm --filter protocol run test` which handles this.
- **App uses Next.js** — `type-check` catches things `lint` doesn't and vice versa. Run both.
