# Sapience App

A Next.js client for the Sapience prediction market on the Robinhood (Meridian) deployment.

Four pages: **markets** (browse and filter), **analytics**, **feed**, and **vaults**. Only the vault page transacts — deposits and withdrawals through your connected wallet.

## Getting started

```bash
pnpm install
cp .env.sample .env   # every value is optional; defaults point at the hosted deployment
pnpm dev              # http://localhost:3000
```

```bash
pnpm check            # lint + type-check + test
pnpm build            # production build
```

There is no backend in this repo. The app reads from the hosted GraphQL API and opens one websocket to the relayer for live vault share-price quotes.

See [`AGENTS.md`](AGENTS.md) for project structure and conventions.

## Static Build

A parallel build target produces a fully client-renderable static version suitable for hosting on IPFS, S3, Cloudflare Pages, or any static file server — a censorship-resistant distribution channel alongside the SSR deployment.

### Build

```bash
pnpm build:static     # output in out/
```

### Local preview

```bash
npx serve out --single -l 3333
# Open http://localhost:3333
```

`--single` enables SPA fallback routing (serves `index.html` for unknown paths), mirroring how static hosts handle the `_redirects` / `200.html` files.

### Pin to Pinata (IPFS)

```bash
# Get a JWT at https://app.pinata.cloud/developers/api-keys
export PINATA_JWT="your-jwt-here"
pnpm pin:ipfs
```

This uploads `out/` to Pinata and prints the resulting CID and gateway URL.

### Update ENS contenthash

After pinning, point an ENS name at the IPFS build:

1. **Via the ENS app**: go to `https://app.ens.domains/<your-name>.eth?tab=records` and set the Content Hash to `ipfs://<CID>`

2. **Via cast** (foundry):
   ```bash
   cast send <resolver-address> "setContenthash(bytes32,bytes)" <namehash> <encoded-cid> --rpc-url https://eth.llamarpc.com --private-key $ENS_PRIVATE_KEY
   ```

### How it works

`scripts/build-static.mjs`:

1. Swaps server-dependent pages with client-only `.static.tsx` overrides
2. Removes route handlers and dynamic route pages
3. Runs `next build` with `output: 'export'` (via `next.config.static.js`)
4. Restores all original files (guaranteed via a `finally` block)
5. Post-processes `out/` with a `200.html` SPA fallback, `_redirects`, and `_headers`

The dynamic route `/questions/:parts` is handled client-side by `SpaFallbackRouter`, which matches the URL and lazy-loads the page with client-side data fetching.
