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

## Key Dependencies

- `@sapience/sdk` — validation, signing, types, contract addresses
- `ws` — WebSocket server
- `viem` — Ethereum signature verification
- `prom-client` — Prometheus metrics
