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

### Pre-PR checklist (run locally before pushing)
1. `pnpm install` — ensure lockfile is current
2. `pnpm --filter @sapience/sdk run build:lib` — SDK must build first; app, api, and relayer import from it
3. `pnpm --filter @sapience/api run prisma:generate` — required before API compilation (generated client is not committed)
4. `pnpm --filter <package> run lint` — for each package you touched
5. `pnpm --filter <package> run type-check` — for packages with this script (app, sdk, ui)
6. `pnpm --filter <package> run test -- --run` — for packages with tests (api, relayer)
7. For protocol: `forge fmt` then `pnpm --filter protocol run test`

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
