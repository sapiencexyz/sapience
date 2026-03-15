# CLAUDE.md

Sapience is a pnpm monorepo (Node ≥ 20.14, pnpm 9.x). Run `pnpm install` to set up.

See [`AGENTS.md`](AGENTS.md) for comprehensive project context, commands, CI requirements, and deployment details. Package-level guides exist at `packages/*/AGENTS.md` and `packages/*/CLAUDE.md`.

## Test-Driven Development

Write tests before implementation. When adding or changing behavior:

1. Write a failing test that captures the expected behavior
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

When fixing a bug, first write a test that reproduces it, then fix the code.

## Build order matters

1. `pnpm --filter @sapience/sdk run build:lib` — SDK must build first; app, api, and relayer import from it
2. `pnpm --filter @sapience/api run prisma:generate` — required before API compilation (generated client is not committed)

## Common footguns

- **SDK is a build dependency.** If you change SDK types, rebuild it before checking other packages.
- **`prisma:generate` before API compilation.** The generated Prisma client is not committed.
- **`schema.graphql` and `graphql.ts` are generated files** — never edit directly; run `generate-types` to regenerate.
- **Protocol tests need `forge build --ast`** before `forge test`. Use `pnpm --filter protocol run test` which handles this.
- **App uses Next.js** — `type-check` catches things `lint` doesn't and vice versa. Run both.
