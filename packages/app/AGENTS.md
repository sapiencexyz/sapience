# app

The Sapience product app — Next.js 15 (App Router, Turbopack dev). Consumes `@sapience/sdk` for types/validation/signing, `@sapience/ui` for shared components, and the GraphQL API at `api.sapience.xyz`.

## Dev loop

```bash
pnpm dev:app                                # http://localhost:3000 (Turbopack)
pnpm --filter @sapience/app run lint        # ESLint
pnpm --filter @sapience/app run type-check  # tsc --noEmit
pnpm --filter @sapience/app run test        # Vitest
pnpm --filter @sapience/app run test:e2e    # Playwright
```

`lint` and `type-check` catch different things — run both. Lint catches ESLint-only rules (import order, hook deps, no-explicit-any); type-check catches everything Next.js's build relies on (server/client boundary types, GraphQL field shapes from the generated `@sapience/sdk/types/graphql`). Build runs `lint` first (`pnpm build` = `pnpm lint && next build`), so type-check failures only surface in CI or local explicit runs.

Build output is server-rendered Next.js. The Vercel deploy uses this. If you need a static export for IPFS/Cloudflare Pages, see "Static build" below.

## Anatomy

- `src/app/` — App Router routes. Mirrors the URL structure (`/profile`, `/markets`, `/auction`, `/feed`, `/terminal`, `/skills`, etc.).
- `src/components/` — Page-level components, organised by feature (`profile/`, `markets/`, `vaults/`, etc.). One feature per directory; shared primitives live in `@sapience/ui`.
- `src/hooks/` — Custom hooks. `hooks/graphql/` is the home for all data hooks; each hook wraps a `fetchX` from `@sapience/sdk/queries` in TanStack Query.
- `src/lib/` — Cross-cutting modules: `session/` (ZeroDev session keys), `context/` (React context providers — Session, Auth, Sapience, Collateral, Chat, Theme), `wagmi.ts`, query client, helpers.
- `src/app/api/permit/` — the only server route handler. Everything else is client-side.

## Static build (`pnpm build:static`)

`scripts/build-static.mjs` produces a fully client-renderable static export for IPFS/S3/Cloudflare Pages.

The static target diverges from the SSR build in three ways:

1. **`*.static.tsx` overrides swap in.** The script copies any `*.static.tsx` next to a regular page over the original (e.g. `not-found.static.tsx` replaces `not-found.tsx`). Originals are restored in a `finally` block — bail-outs mid-build don't leave the working tree dirty, but if you Ctrl-C _and_ the script doesn't reach `finally`, run `git status` and inspect.
2. **Server-only files are removed.** Route handlers (`route.ts`) and any page that uses dynamic params get deleted before `next build` runs.
3. **`NEXT_BUILD_TARGET=static`** flips `next.config.js` to use `next.config.static.js`'s settings (output: 'export', trailing slashes, no image optimisation).

If you add a new page that genuinely doesn't work without a server, add a `.static.tsx` sibling that renders a fallback or routes the user to the canonical hosted URL. If the page is fully client-renderable, the static build picks it up automatically.

## Data layer

Pattern across `src/hooks/graphql/`:

```ts
import { useQuery } from '@tanstack/react-query';
import { fetchCategories } from '@sapience/sdk/queries';
import type { Category } from '@sapience/sdk/types/graphql';
```

`@sapience/sdk/queries` exports `fetchX` functions and their result types. `@sapience/sdk/types/graphql` exports the generated GraphQL type shapes. Both are produced by the API package's `generate-types` step — never edit `packages/sdk/types/graphql.ts` by hand. If a query is missing a field, edit the GraphQL document in the SDK source, then run `pnpm --filter @sapience/api run generate-types` and rebuild the SDK. See `packages/sdk/AGENTS.md` for the full chain.

## Session keys (ZeroDev)

`src/lib/session/sessionKeyManager.ts` and `src/lib/context/SessionContext.tsx` are the load-bearing files. Invariants:

- Sessions are per-chain. Switching networks restores or creates a session for the target chain — there is no global "logged-in" state.
- The session private key never leaves the browser. The relayer receives the _approval_ (a signed authorization), not the key. Verification happens via `verifyAuctionIntentSignature` / `verifyCounterpartyMintSignature` in `@sapience/sdk/auction/escrowSigning`.
- Session restoration is lazy. Secondary chains (anything other than the connected chain) don't create sessions until first use.
- `useSapienceWriteContract` is the only hook that should route between session-key and direct-wallet write paths. Don't bypass it.

Full deep-dive in `docs/SESSION_KEYS.md` at the repo root.

## Footguns

- **Turbopack caching** — `pnpm dev:app` uses `next dev --turbo`. Hot reload occasionally misses changes to module-level constants in shared `@sapience/sdk` files. If a change in the SDK isn't reflected, restart the dev server. (Rebuilding the SDK alone is not enough; the Turbopack cache is the issue.)
- **Type-check after schema changes** — when the GraphQL schema changes, regenerated `graphql.ts` can break consumers silently in `lint` (which only reads the file). Always run `type-check` after `pnpm --filter @sapience/api run generate-types`.
- **Static-build divergence** — adding a page that uses `useSearchParams` without `<Suspense>` builds fine in dev/SSR but fails the static export. If you're adding a new route, run `pnpm build:static` once before merging.
- **Sentry source maps** — the SSR build uploads source maps to Sentry on `next build`. Missing `SENTRY_AUTH_TOKEN` in CI causes the build to _succeed_ but skip uploads, which silently degrades production debugging. Verify the token is present.
