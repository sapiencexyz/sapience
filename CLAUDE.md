# CLAUDE.md

Welcome! Before making any changes in this repository, please review the agent guides:

- `AGENTS.md` at the repository root for a high-level overview of the monorepo.
- Package-specific guides such as `packages/api/AGENTS.md` (and any future `AGENTS.md` files) for workflow details, commands, and constraints.

Always read the relevant `AGENTS.md` before editing code so you understand required tooling, environment variables, and deployment expectations.

Once you have the context, follow the instructions inside those guides when working on tasks. Thanks!

## CI Requirements

CI uses path-filtered jobs — only packages with changed files are checked. All checks must pass before merge.

### What CI checks
- **API** (`packages/api`): lint, compile, vitest
- **App** (`packages/app`): lint, type-check
- **SDK** (`packages/sdk`): build, lint, type-check
- **UI** (`packages/ui`): lint, type-check
- **Relayer** (`packages/relayer`): lint
- **Protocol** (`packages/protocol`): `forge fmt --check`, contract tests

SDK changes also trigger API, App, and Relayer checks (they depend on it). UI changes trigger App checks.

### Quick local check
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

### Build order matters
1. `pnpm --filter @sapience/sdk run build:lib` — SDK must build first; app, api, and relayer import from it
2. `pnpm --filter @sapience/api run prisma:generate` — required before API compilation (generated client is not committed)

### Standardized scripts
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

### Common footguns
- **SDK is a build dependency.** If you change SDK types, rebuild it before checking other packages.
- **`prisma:generate` before API compilation.** The generated Prisma client is not committed.
- **`schema.graphql` and `graphql.ts` are generated files** — never edit directly, use bash commands to regenerate.
- **Protocol tests need `forge build --ast`** before `cannon test`. Use `pnpm --filter protocol run test` which handles this.
- **App uses Next.js** — `type-check` catches things `lint` doesn't and vice versa. Run both.

### Dependency chain
```
protocol (standalone — Foundry/Cannon)
sdk (standalone — tsup)
  ├── api (depends on sdk)
  ├── app (depends on sdk + ui)
  └── relayer (depends on sdk)
ui (standalone)
  └── app (depends on ui)
```
