# CLAUDE.md

Sapience is a pnpm monorepo (Node ≥ 20.14, pnpm 9.x). Run `pnpm install` to set up.

See [`AGENTS.md`](AGENTS.md) for comprehensive project context, commands, CI requirements, and deployment details. Package-level guides exist at `packages/*/AGENTS.md` and `packages/*/CLAUDE.md`.

## Project Overview

This is a prediction market platform (Sapience) with: keeper services, GraphQL API, React frontend, Polymarket integration, on-chain settlement via conditional tokens. Key packages: keeper, frontend (FE), relayer, API. Predictions have conditions, positions, and settlement flows.

## Terminology

- **Predictions** are created by users and do not ALL settle.
- **Conditions** settle on-chain.
- **Positions** are user holdings.
- Do not confuse these terms.
- The **keeper** package handles cron jobs, settlement, and relisting.
- The **API** package handles GraphQL resolvers.

## External APIs

When working with Polymarket API: use `condition_ids` (plural) as repeated query params, not `condition_id`. EndDates come from the `end_date_iso` field. Always verify API parameter names against actual API responses before assuming.

## Git & PRs

When creating PRs: only include changes that are actually in the diff vs the target branch. Do NOT mention changes already merged to main. Run `git diff main..HEAD --stat` to verify.

## Debugging

Before investigating any bug or issue, ASK the user:

1. Which package/layer is affected? (keeper, API, frontend, relayer, SDK)
2. Which files or area within that package?
3. What behavior are you seeing vs what you expect?

Do NOT start searching the codebase until you have at least (1) and (3). Do not guess the package — the wrong assumption wastes entire rounds of investigation.

When debugging data issues, distinguish between frontend vs API as the source of the problem BEFORE making changes.

## Test-Driven Development

Write tests before implementation. When adding or changing behavior:

1. Write a failing test that captures the expected behavior
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

When fixing a bug, first write a test that reproduces it, then fix the code.

## Build order matters

1. `pnpm --filter @sapience/sdk run build:lib` — SDK must build first; app, api, and relayer import from it
2. `pnpm --filter @sapience/api run prisma:generate` — required before API compilation (generated client is not committed)

## Running tests

Always build the SDK before running tests in app, api, or relayer — their test suites import from SDK dist files and will fail with Vite transform errors if the SDK hasn't been built:

```bash
pnpm --filter @sapience/sdk run build:lib   # must come first
pnpm --filter @sapience/app run test        # or api, relayer, sdk
```

If a test fails on an import from `@sapience/sdk/*`, rebuild the SDK before investigating further — it is almost certainly a missing build, not a real test failure.

## Common footguns

- **SDK is a build dependency.** If you change SDK types, rebuild it before checking other packages. If you run tests without building the SDK first, you will get Vite transform errors that look like test failures but aren't.
- **`prisma:generate` before API compilation.** The generated Prisma client is not committed.
- **`schema.graphql` and `graphql.ts` are generated files** — never edit directly; run `generate-types` to regenerate.
- **Protocol tests need `forge build --ast`** before `forge test`. Use `pnpm --filter protocol run test` which handles this.
- **App uses Next.js** — `type-check` catches things `lint` doesn't and vice versa. Run both.
