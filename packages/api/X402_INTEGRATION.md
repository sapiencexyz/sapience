# x402 Payment Integration

This document explains the x402 payment protocol integration in the Sapience API. x402 gates HTTP endpoints behind USDC micropayments using the `402 Payment Required` status code, settled on Arbitrum One.

## Overview

When a client exceeds the free tier rate limit, the API responds with HTTP 402 and a `PAYMENT-REQUIRED` header describing the accepted payment. The client signs a USDC `transferWithAuthorization` (EIP-3009) message and retries the request with a `Payment-Signature` header. The API verifies the signature and settles on-chain via an in-process facilitator.

```
                   Free tier (≤200 req/min)
Client ──────────────────────────────────────► API (200 OK)

                   Over free tier, no payment
Client ──────────────────────────────────────► API (402 Payment Required)
       ◄─── PAYMENT-REQUIRED header ──────────

                   Over free tier, with payment
Client ──── Payment-Signature header ────────► API (verify → 200 OK → settle on-chain)
```

## Architecture

The facilitator runs **in-process** — no separate service required. A single API server instance handles both request serving and payment settlement.

| Component | Description |
|-----------|-------------|
| `x402ResourceServer` | Parses and validates payment headers |
| `x402Facilitator` | Verifies EIP-3009 signatures and settles on-chain |
| `toFacilitatorEvmSigner` | Wraps a viem wallet client for the facilitator |
| `paymentMiddleware` | Express middleware from `@x402/express` |

### On-chain details

| | Value |
|---|---|
| Chain | Arbitrum One |
| CAIP-2 network | `eip155:42161` |
| Asset | Native USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) |
| Transfer method | EIP-3009 `transferWithAuthorization` |
| Payment scheme | `exact` |

## Tiered Rate Limiting

The middleware stack runs in this order for every request:

```
Request
  │
  ▼
helmet / json / cors          (base middleware)
  │
  ▼
hardLimiter (400 req/min)     → 429 if exceeded (no exceptions)
  │
  ▼
freeTierLimiter (200 req/min) → sets req.requiresPayment=true if exceeded
                                 (skips counting if Payment-Signature present)
  │
  ▼
x402 handler                  → if requiresPayment OR Payment-Signature:
  │                               - no payment header → 402
  │                               - valid payment → next() → settle on-chain
  │                             else: next()
  │
  ▼
Router (GraphQL, REST, etc.)
```

### Tiers

| Tier | Requests/min | Behavior |
|------|-------------|----------|
| Free | 0–200 | Requests pass through normally |
| Paid | 200–400 | Requires valid USDC payment per request |
| Hard limit | >400 | Rejected with 429 regardless of payment |

## Dynamic Pricing

Payment amounts are determined by GraphQL query complexity, calculated using the same estimators as Apollo Server's validation layer (shared via `createComplexityEstimators` in `queryComplexity.ts`).

| Tier | Complexity range | Price (USDC) |
|------|-----------------|--------------|
| Simple | 0–1,000 | $0.005 |
| Medium | 1,000–5,000 | $0.015 |
| Complex | 5,000+ | $0.030 |

Non-GraphQL requests default to the simple tier.

On complexity calculation error, the highest tier is charged to prevent abuse.

### Complexity scoring examples

| Field | Cost |
|-------|------|
| Regular fields | 1 (default) |
| `__type` | 50 |
| `__schema` | 100 |
| `tradingVolumeByAddress` | 500 |
| `topForecasters` | 1,500 |
| `dailyVolumes` | 1,500 |
| `protocolStats` | 2,000 |
| `_count`, `_sum`, `_avg`, `_min`, `_max` | 5,000 |
| `_all` | 10,000 |

List fields multiply their children's cost by the requested list size (capped at `GRAPHQL_MAX_LIST_SIZE`).

## Gas Guard

Before requiring payment, the middleware checks the current Arbitrum gas price. If estimated settlement gas cost exceeds the payment amount, it returns **503** instead of 402 to avoid unprofitable settlements.

```
Gas cost > payment amount → 503 Service Temporarily Unavailable
                            (retryAfter: 300 seconds)
```

Settlement gas is estimated at 80,000 units (EIP-3009 `transferWithAuthorization`). ETH/USD rate is hardcoded at $3,000 (conservative estimate). On gas price check failure, it fails open (assumes gas is affordable).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `X402_PAY_TO` | Yes (to enable) | `''` | EVM address that receives USDC payments. If empty, x402 is disabled and only the free tier limiter runs. |
| `X402_FACILITATOR_PRIVATE_KEY` | Yes (if X402_PAY_TO set) | `''` | Private key for the facilitator wallet. This wallet submits settlement transactions — fund it with ETH on Arbitrum for gas. |
| `X402_ARBITRUM_RPC_URL` | No | `https://arb1.arbitrum.io/rpc` | Arbitrum One RPC endpoint. |
| `FREE_TIER_RATE_LIMIT` | No | `200` | Max requests/min before payment is required. |
| `HARD_RATE_LIMIT` | No | `400` | Absolute max requests/min (even with payment). |

## File Layout

| File | Responsibility |
|------|---------------|
| `src/x402.ts` | In-process facilitator, complexity-based pricing, gas guard, payment middleware creation |
| `src/middleware.ts` | CORS, helmet, rate limiters, x402 handler wiring, admin auth |
| `src/app.ts` | Express app factory — calls `setupMiddleware`, mounts router |
| `src/config.ts` | Environment variable definitions (x402 + rate limit configs) |
| `src/graphql/queryComplexity.ts` | Shared `createComplexityEstimators()` used by both Apollo validation and x402 pricing |
| `src/scripts/testX402Payment.ts` | End-to-end payment test script (`pnpm test:x402`) |
| `src/__tests__/tieredRateLimiting.test.ts` | Unit tests for the three-tier rate limiting system |

## CORS

Payment-related headers are configured in `corsOptions`:

- **Allowed**: `Payment-Signature` (client sends signed payment)
- **Exposed**: `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`, `X-PAYMENT-RESPONSE` (server sends payment requirements/receipts)

## Testing

```bash
# Unit tests (mocks x402 and viem, tests rate limit tiers)
pnpm --filter @sapience/api test

# End-to-end payment flow (requires funded wallets + Arbitrum RPC)
pnpm --filter @sapience/api test:x402
```

## Dependencies

```
@x402/express   - Express payment middleware
@x402/core      - Resource server + facilitator
@x402/evm       - EVM scheme registration + signer utilities
```
