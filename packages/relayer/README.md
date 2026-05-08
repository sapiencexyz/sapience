# @sapience/relayer

WebSocket relayer that brokers auctions between predictors and counterparties (vault bots, market makers). In-memory message router — every signature is ultimately verified on-chain at mint time.

## Quick start

```bash
pnpm dev:relayer       # from repo root
# or
pnpm --filter @sapience/relayer run dev
```

Default port: `3002`. Configure via `PORT`. Production: `pnpm --filter @sapience/relayer start`.

## Documentation

The full protocol — payload schemas, EIP-712 signing, error codes, and example flows — is on the public docs site:

**[docs.sapience.xyz/builder-guide/api/auction-relayer](https://docs.sapience.xyz/builder-guide/api/auction-relayer)**

That page is auto-generated against the SDK type definitions in [`packages/sdk/types/escrow.ts`](../sdk/types/escrow.ts). It is the source of truth — when in doubt, trust the type definitions, not prose.

For internal architecture (how the package is laid out, transport vs handlers, observability) see [`AGENTS.md`](AGENTS.md).

## Environment variables

| Variable                    | Default       | Description                                                 |
| --------------------------- | ------------- | ----------------------------------------------------------- |
| `PORT`                      | `3002`        | HTTP/WebSocket server port                                  |
| `ENABLE_AUCTION_WS`         | `true`        | Toggle the `/auction` channel                               |
| `WS_MAX_CONNECTIONS`        | `1000`        | Max concurrent connections                                  |
| `WS_MAX_CONNECTIONS_PER_IP` | `50`          | Per-IP connection cap                                       |
| `WS_IDLE_TIMEOUT_MS`        | `300000`      | Idle disconnect (5 min)                                     |
| `WS_ALLOWED_ORIGINS`        | -             | Comma-separated allowed origins                             |
| `RATE_LIMIT_WINDOW_MS`      | `10000`       | Rate-limit window                                           |
| `RATE_LIMIT_MAX_MESSAGES`   | `100`         | Max messages per window                                     |
| `CHAIN_5064014_RPC_URL`     | -             | Custom RPC for Ethereal mainnet (enables ERC-1271 fallback) |
| `CHAIN_13374202_RPC_URL`    | -             | Custom RPC for Ethereal testnet                             |
| `SENTRY_DSN`                | -             | Sentry error reporting                                      |
| `NODE_ENV`                  | `development` | Environment                                                 |

Core relayer env vars are in [`src/config.ts`](src/config.ts); chain RPC overrides are read by `@sapience/sdk/constants` via `CHAIN_<chainId>_RPC_URL`.

## Vault quote channel

The vault quote protocol is multiplexed on the same `/auction` endpoint. Subscribe with `{type: 'vault_quote.subscribe', payload: {chainId, vaultAddress}}` and receive `vault_quote.update` messages carrying `vaultCollateralPerShare`. Used by the app for live vault pricing without RPC polling.

## Secondary market channel

Atomic OTC swap of position tokens after mint, also on the same connection (`secondary.*` message-type prefix). See [`src/secondaryMarketTypes.ts`](src/secondaryMarketTypes.ts).
