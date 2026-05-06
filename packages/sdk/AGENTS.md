# sdk

Shared TypeScript SDK for Sapience. Used by the app, API, relayer, market-keeper, and external integrators (published as `@sapience/sdk` on npm).

## Build dependency rule

**The SDK must be built before any consuming package can be type-checked, tested, or run.** All consumers (`app`, `api`, `relayer`, `market-keeper`) import from the SDK's _built_ `dist/` output, not its source. Running tests in those packages without first building the SDK produces Vite transform errors that look like test failures but are actually missing-dist errors.

```bash
pnpm --filter @sapience/sdk run build:lib   # always run first
pnpm --filter @sapience/<consumer> run test
```

`build:lib` uses tsup to emit both ESM and CJS bundles plus `.d.ts` for every exported subpath. The `prepare` lifecycle hook also calls `build:lib`, so a fresh `pnpm install` produces a built SDK.

## Subpath imports

The SDK is published with a granular `exports` map — consumers should import from the most specific subpath rather than the root. The root export (`@sapience/sdk`) is a kitchen-sink convenience and pulls in everything.

| Subpath                                                         | What it gives you                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `@sapience/sdk/types`                                           | Re-exports of escrow + GraphQL types                             |
| `@sapience/sdk/types/escrow`                                    | Auction protocol types (`AuctionRFQPayload`, `BidPayload`, etc.) |
| `@sapience/sdk/types/secondary`                                 | Secondary market types                                           |
| `@sapience/sdk/types/graphql`                                   | **Generated** — do not edit by hand                              |
| `@sapience/sdk/auction/validation`                              | Tier 1 RFQ + bid validation                                      |
| `@sapience/sdk/auction/escrowSigning`                           | EIP-712 builders + verifiers (`AuctionIntent`, `MintApproval`)   |
| `@sapience/sdk/auction/simulate`                                | Tier 3 mint simulation via `eth_call`                            |
| `@sapience/sdk/auction/buildAuctionPayload`                     | Helper to assemble an `AuctionRequestPayload` from RFQ + bid     |
| `@sapience/sdk/auction/bidPreprocessor`                         | Client-side bid filtering / sorting                              |
| `@sapience/sdk/auction/secondarySigning`                        | EIP-712 for secondary-market trades                              |
| `@sapience/sdk/relayer/escrowAuctionWs`                         | High-level WebSocket client (`createEscrowAuctionWs`)            |
| `@sapience/sdk/queries`                                         | `fetchX` functions for every GraphQL query                       |
| `@sapience/sdk/queries/client/graphqlClient`                    | Underlying `graphql-request` client                              |
| `@sapience/sdk/contracts` / `@sapience/sdk/contracts/addresses` | Per-chain contract addresses + helpers                           |
| `@sapience/sdk/abis`                                            | Contract ABIs for viem                                           |
| `@sapience/sdk/constants`                                       | `CHAIN_ID_ETHEREAL`, etc.                                        |
| `@sapience/sdk/session`                                         | Session-key verification helpers (smart-account-aware)           |
| `@sapience/sdk/utils`                                           | Shared utilities (formatting, etc.)                              |

When adding a new subpath: add the entry to `package.json` `exports`, list its source file in both `dev` and `build:lib` scripts, and rebuild.

## Validation tier model

Three tiers, each more expensive than the last. Pick the cheapest tier that gives you the confidence you need. See `auction/validation.ts` for full docs.

| Tier | Module                                         | Requires              | When                                                              |
| ---- | ---------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| 1    | `auction/validation.ts`                        | Nothing (offline)     | On message arrival — relayer + bots both run this                 |
| 2    | `auction/validation.ts` (`validateBidOnChain`) | RPC reads             | Pre-submit on bids — checks nonce freshness, balances, allowances |
| 3    | `auction/simulate.ts`                          | RPC + state overrides | Pre-submit, full mint simulation via `eth_call`                   |

The relayer keeps bid validation Tier 1/offline, but `auction.start` may use an RPC-backed ERC-1271 fallback and `vault_quote.publish` uses RPC to verify the vault manager. Authoritative validation is on-chain at `mint()` time. Tier 2/3 are _advisory_ tools for clients that want pre-submit confidence.

## Generated files

`types/graphql.ts` is generated by the API package's `generate-types` script (which runs `prisma:generate` → `emit-schema` → `graphql-codegen`). It is committed to the repo so SDK consumers don't need to run codegen themselves, but it is **read-only** — edit the API GraphQL resolvers and regenerate, never edit the file directly. CI guards this with a `git diff --exit-code` check.

To regenerate after a resolver change:

```bash
pnpm --filter @sapience/api run generate-types
pnpm --filter @sapience/sdk run build:lib
```

## Division of labour

This package contains:

- Pure data types (Solidity-equivalent TS interfaces)
- Pure functions (signing, validation, encoding, hashing)
- Stateless query helpers (one `fetchX` per GraphQL query)
- Contract addresses and ABIs

This package does **not** contain:

- React hooks (peerDeps include react/wagmi only because some legacy code lives here pending migration; new hooks belong in `packages/ui` or `packages/app`)
- Apollo / TanStack Query setup (the SDK ships `fetchX` functions; consumers wrap them in whatever client they prefer)
- Network connection management (the SDK exposes `createEscrowAuctionWs` as a thin client, but doesn't manage reconnection / state — that's app responsibility)

Keep the SDK pure and side-effect-free where possible. It runs in browsers, Node, and edge runtimes (Cloudflare Workers).

## Tests

```bash
pnpm --filter @sapience/sdk run test
```

Vitest. Test files live next to the source (`*.test.ts`). The most consequential suites are:

- `auction/validation.test.ts` and `auction/escrowSigning.test.ts` — protocol correctness
- `contracts/__tests__/addresses.test.ts` — address-map invariants (every chain has a current entry, legacy is consistent)
- `types/__tests__/escrow.test.ts` — V1↔V2 outcome-side normalization (load-bearing for the indexer)
