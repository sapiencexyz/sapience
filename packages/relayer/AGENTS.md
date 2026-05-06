# Relayer

WebSocket relay service for the Sapience prediction market auction protocol.

## Architecture: Transport / Handler / Registry

The relayer is structured in three layers:

### Transport Layer (`transport/`, `ws.ts`)

Handles connection lifecycle and message dispatch. Transport-agnostic interfaces
(`ClientConnection`, `SubscriptionManager`) allow swapping WebSocket for NATS,
gossip, or any other pub/sub transport.

- `transport/types.ts` — `ClientConnection`, `SubscriptionManager`, `ConnectionHooks` interfaces
- `transport/wsTransport.ts` — WebSocket adapter (`createWsClientConnection`)
- `transport/subscriptions.ts` — `InMemorySubscriptionManager` implementation
- `ws.ts` — thin WS dispatch (~360 lines), delegates to handlers

### Handler Layer (`handlers/`)

Pure business logic functions that take `ClientConnection` + `SubscriptionManager`.
No transport awareness. All validation delegated to SDK.

- `handlers/escrow.ts` — auction start, bid submit, subscribe/unsubscribe
- `handlers/vault.ts` — vault quote publish/subscribe/observe
- `secondaryMarketHandlers.ts` — secondary market listings (still uses raw WebSocket — future migration to `ClientConnection`)

### Registry Layer (`escrowRegistry.ts`, `secondaryMarketRegistry.ts`)

In-memory state stores with TTL-based cleanup. No transport or handler awareness.

## Validation Architecture

The relayer delegates all validation to `@sapience/sdk/auction/validation`.
It is NOT the authority on validity — each consumer validates independently.
The relayer has **no RPC dependency** for message handling — all on-chain
validation is the client's responsibility.

- `auction.start` → `validateAuctionRFQ()` (Tier 1 hard gate, offline only)
- `bid.submit` → `validateBid()` (Tier 1 hard gate, offline only, no `publicClient`)
  - Provably invalid bids (missing fields, expired, malformed signature) → rejected
  - Signature mismatches (recovered ≠ counterparty) → relayed as unverified (could be ERC-1271 smart contract)
  - Valid EOA/smart-account signatures → relayed
- `vault_quote.publish` → field + timestamp + signature validation + on-chain manager auth check

No `validationStatus` / `validationError` on broadcast bids — the relayer
doesn't annotate. Clients validate independently using `preprocessBids`.

## Testing

```bash
pnpm --filter @sapience/relayer run test        # all tests
pnpm --filter @sapience/relayer run test:watch  # watch mode
```

Test files:

- `__tests__/handlers.test.ts` — unit tests for handler functions (mock ClientConnection/SubscriptionManager)
- `__tests__/transport.test.ts` — InMemorySubscriptionManager tests
- `__tests__/wsTransport.test.ts` — WebSocket adapter tests
- `__tests__/ws.integration.test.ts` — auction lifecycle integration tests (real WS server)
- `__tests__/ws.connectionManagement.integration.test.ts` — rate limiting, idle timeout, connection limits
- `__tests__/ws.e2e.test.ts` — end-to-end auction lifecycle with real EIP-712 signatures

## Observability

Sentry is initialised on boot (`src/instrument.ts`) and only fires in production. Logs are stdout-only — there is no Pino setup yet (the API has one; see root AGENTS.md).

Prometheus metrics are exposed at `GET /metrics` on the same HTTP port as the WebSocket server. Scrape them or browse directly. Defined in `src/metrics.ts`:

| Metric                                        | Shape                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `relayer_connections_active`                  | gauge — current open WebSocket connections                                     |
| `relayer_connections_total`                   | counter — lifetime opened connections                                          |
| `relayer_connections_closed_total`            | counter — lifetime closed, labelled by reason                                  |
| `relayer_messages_received_total`             | counter — labelled by message `type`                                           |
| `relayer_messages_sent_total`                 | counter — labelled by message `type`                                           |
| `relayer_message_processing_duration_seconds` | histogram — labelled by `type`                                                 |
| `relayer_auctions_started_total`              | counter                                                                        |
| `relayer_bids_submitted_total`                | counter                                                                        |
| `relayer_subscriptions_active`                | gauge — labelled by `subscription_type`                                        |
| `relayer_rate_limit_hits_total`               | counter                                                                        |
| `relayer_errors_total`                        | counter — labelled by error `type` and `message_type`                          |
| `relayer_auction_broadcast_sends_total`       | counter — per-client broadcast attempts (labelled by `service`/`variant`/`ok`) |
| `relayer_auction_received_acks_total`         | counter — client-side delivery confirmations                                   |
| `relayer_clients_identified_total`            | counter — labelled by `service`/`variant`                                      |

Per-client broadcast logging (`auction.broadcast.send ok=…`) is the ground truth for "did we attempt to deliver this auction to that bot." Without it, a silent miss is indistinguishable from a relayer-side failure — keep these log lines.

## Scaling and state

Auction state is in-memory in `escrowRegistry.ts` / `secondaryMarketRegistry.ts`. The relayer has **no shared store** — running multiple instances behind a load balancer requires either sticky sessions or moving state to Redis. The latter is in progress as a separate workstream (see staging branch).

## Key Dependencies

- `@sapience/sdk` — validation, signing, types, contract addresses
- `ws` — WebSocket server
- `viem` — Ethereum signature verification
- `prom-client` — Prometheus metrics
- `@zerodev/sdk` / `@zerodev/ecdsa-validator` — smart-account signature verification (older pins than the app; see `docs/SESSION_KEYS.md`)
