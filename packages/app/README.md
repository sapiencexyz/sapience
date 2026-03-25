# Sapience App

## Static Build

A parallel build target produces a fully client-renderable static version of the app suitable for hosting on IPFS, S3, Cloudflare Pages, or any static file server. This provides a censorship-resistant distribution channel without affecting the existing SSR deployment.

### Build

```bash
# SDK must be built first (build dependency)
pnpm --filter @sapience/sdk run build:lib

# Produce static build in packages/app/out/
pnpm --filter @sapience/app run build:static
```

### Local Preview

```bash
npx serve packages/app/out --single -l 3333
# Open http://localhost:3333
```

The `--single` flag enables SPA fallback routing (serves `index.html` for unknown paths), which mirrors how static hosting platforms handle the `_redirects` / `200.html` files.

### Pin to Pinata (IPFS)

```bash
# Set your Pinata JWT (get one at https://app.pinata.cloud/developers/api-keys)
export PINATA_JWT="your-jwt-here"

# Pin the build output
pnpm --filter @sapience/app run pin:ipfs
```

This uploads `packages/app/out/` to Pinata and prints the resulting CID and gateway URL.

### Update ENS Contenthash

After pinning, you can point an ENS name to the IPFS build:

1. **Via the ENS app**: Go to `https://app.ens.domains/<your-name>.eth?tab=records` and set the Content Hash to `ipfs://<CID>`

2. **Via the pin script**:

   ```bash
   export PINATA_JWT="your-jwt-here"
   export ENS_PRIVATE_KEY="0x..."  # ENS name owner/manager key
   pnpm --filter @sapience/app run pin:ipfs -- --ens sapience.eth
   ```

3. **Via cast** (foundry):
   ```bash
   cast send <resolver-address> "setContenthash(bytes32,bytes)" <namehash> <encoded-cid> --rpc-url https://eth.llamarpc.com --private-key $ENS_PRIVATE_KEY
   ```

### How It Works

The build script (`scripts/build-static.mjs`):

1. Swaps server-dependent pages with client-only `.static.tsx` overrides
2. Removes route handlers (API routes, OG image generators) and dynamic route pages
3. Removes Sentry/instrumentation configs
4. Runs `next build` with `output: 'export'` (via `next.config.static.js`)
5. Restores all original files (guaranteed via `finally` block)
6. Post-processes `out/` with `200.html` SPA fallback, `_redirects`, and `_headers`

Dynamic routes (`/predictions/:id`, `/forecast/:uid`, `/questions/:parts`, `/profile/:address`) are handled client-side via `SpaFallbackRouter`, which matches the URL and lazy-loads the appropriate component with client-side data fetching.
