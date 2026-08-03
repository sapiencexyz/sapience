# Sapience App

The Sapience product app — Next.js 15 (App Router, Turbopack dev), pinned to the Robinhood (Meridian) deployment. Reads from the hosted GraphQL API; the vault page transacts through the connected wallet.

This is a single package. There is no workspace, no build-order dependency, and no backend to run alongside it.

## Dev loop

```bash
pnpm dev          # http://localhost:3000 (Turbopack)
pnpm lint         # ESLint
pnpm type-check   # tsc --noEmit
pnpm test         # Vitest
pnpm test:e2e     # Playwright
pnpm check        # lint + type-check + test
```

`lint` and `type-check` catch different things — run both. Lint catches ESLint-only rules (import order, hook deps, no-explicit-any); type-check catches everything Next.js's build relies on (server/client boundary types, GraphQL field shapes from `~/lib/sdk/types/graphql`). `pnpm build` runs `lint` first, so type-check failures only surface in CI or an explicit local run.

## Anatomy

- `src/app/` — App Router routes, mirroring the URL structure: `/markets`, `/analytics`, `/feed`, `/vaults`, plus `/questions/[...parts]` for market detail. `/` redirects to `/markets`.
- `src/components/` — Feature components (`markets/`, `vaults/`, `analytics/`, `positions/`, `layout/`), with shadcn primitives in `components/ui/`.
- `src/hooks/` — `hooks/graphql/` holds every data hook; each wraps a `fetchX` from `~/lib/sdk/queries` in TanStack Query. `hooks/blockchain/` and `hooks/contract/` hold the wagmi read/write hooks.
- `src/lib/sdk/` — Vendored SDK: chain constants, contract addresses, ABIs, GraphQL queries and generated types, and on-chain call builders. Formerly a separate package; now plain app source.
- `src/lib/` — Cross-cutting modules: `context/` (Settings, Auth, Sapience, ConnectDialog, Theme), `ws/` (relayer socket), config, formatting, resolvers.
- `src/app/api/permit/` — the only server route handler (geofence lookup). Everything else is client-side.

## Environment

Copy `.env.sample` to `.env`. Every value is optional — the app falls back to the Robinhood/Meridian defaults in `src/lib/config/networkDefaults.ts`. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if you need WalletConnect locally.

## Wallet & transactions

Plain wagmi throughout. `useSapienceWriteContract` is the single write path — it validates/switches the chain, submits via `writeContract` or EIP-5792 `sendCalls`, resolves the settled hash, and surfaces toasts. Don't bypass it.

There are no smart accounts, session keys, or paymasters. The collateral asset is USDe as a standard ERC-20, so a deposit is at most `approve` + `requestDeposit` — there is no wrap step.

## Data layer

Pattern across `src/hooks/graphql/`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '~/lib/sdk/queries';
import type { Category } from '~/lib/sdk/types/graphql';
```

`~/lib/sdk/queries` exports `fetchX` functions; `~/lib/sdk/types/graphql` exports the generated GraphQL shapes. That file is generated from the API's schema, which lives in a different repo — never edit it by hand. If a query needs a new field, edit the GraphQL document in `src/lib/sdk/queries/` and update the type by hand only if the API already returns it.

The feed and activity views poll the API on an interval; there is no subscription. The one live socket is the vault share-price quote (`src/hooks/ws/useVaultShareQuoteWs.ts`) talking to the relayer.

## Static build (`pnpm build:static`)

`scripts/build-static.mjs` produces a fully client-renderable static export for IPFS/S3/Cloudflare Pages:

1. **`*.static.tsx` overrides swap in** — the script copies any `*.static.tsx` sibling over the original (e.g. `not-found.static.tsx` replaces `not-found.tsx`). Originals are restored in a `finally` block.
2. **Server-only files are removed** — route handlers and dynamic-param pages are deleted before `next build`.
3. **`NEXT_BUILD_TARGET=static`** flips `next.config.js` over to `next.config.static.js` (`output: 'export'`, trailing slashes, no image optimisation).

`/questions/:parts` is handled client-side by `SpaFallbackRouter`. If you add a page that can't work without a server, add a `.static.tsx` sibling.

## Footguns

- **Turbopack caching** — hot reload occasionally misses changes to module-level constants under `src/lib/sdk/`. Restart the dev server if a change isn't reflected.
- **Static-build divergence** — `useSearchParams` without `<Suspense>` passes dev/SSR and fails the static export. Run `pnpm build:static` once before merging a new route.
- **Generated GraphQL types** are ESLint-ignored (`src/lib/sdk/types/graphql.ts`); type errors there mean the file drifted from the API.
