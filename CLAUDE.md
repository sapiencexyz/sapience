# CLAUDE.md

Sapience is a single Next.js 15 app (App Router, Turbopack dev). Node >= 20.11, pnpm 10.x. Run `pnpm install` to set up.

See [`AGENTS.md`](AGENTS.md) for project structure, commands, and footguns.

## Project Overview

A read-mostly client for the Sapience prediction market on the Robinhood (Meridian) deployment. Four pages: `/markets` (browse), `/analytics`, `/feed`, and `/vaults`. Only the vault page transacts — deposits and withdrawals through the connected wallet.

There is no backend in this repo. The app talks to the hosted GraphQL API and, for live vault share-price quotes, the relayer websocket.

## Terminology

- **Predictions** are created by users and do not ALL settle.
- **Conditions** settle on-chain.
- **Positions** are user holdings.
- Do not confuse these terms.

## Wallet & chain

- Wallet connection is plain wagmi — no smart accounts, no session keys, no gas sponsorship. Every transaction is signed by the connected EOA.
- The app is pinned to Robinhood mainnet (4663) / testnet (46630). `NEXT_PUBLIC_DEFAULT_CHAIN_ID` overrides which one; a custom chain + RPC can also be set in Settings and persists to localStorage.
- Collateral is USDe as a plain ERC-20. There is no wrap step — do not reintroduce a payable `deposit()` path.

## Debugging

Before investigating any bug, ASK the user:

1. Which page or area is affected?
2. What behavior are you seeing vs what you expect?

Do not start searching the codebase until you have both. When debugging data issues, first establish whether the problem is in the app or in the hosted API response.

## Test-Driven Development

Write tests before implementation. When adding or changing behavior:

1. Write a failing test that captures the expected behavior
2. Implement the minimal code to make the test pass
3. Refactor while keeping tests green

When fixing a bug, first write a test that reproduces it, then fix the code.

## Common footguns

- **`lint` and `type-check` catch different things.** Run both; `pnpm build` only runs `lint`.
- **`src/lib/sdk/types/graphql.ts` is generated** from the API's schema (which lives in a different repo) — never edit it by hand.
- **Static-build divergence** — a page using `useSearchParams` without `<Suspense>` builds fine in dev/SSR but fails `pnpm build:static`.
