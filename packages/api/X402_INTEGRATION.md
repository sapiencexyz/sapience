# x402 Payment Integration

This document explains the x402 payment protocol integration in the Sapience API. x402 gates HTTP endpoints behind USDC micropayments using the `402 Payment Required` status code, settled on Arbitrum One.

## Overview

When a client exceeds the free tier rate limit, the API responds with HTTP 402 and a `PAYMENT-REQUIRED` header describing the accepted payment. The client signs a USDC `transferWithAuthorization` (EIP-3009) message and retries the request with a `Payment-Signature` header. The API verifies the signature and settles on-chain via an in-process facilitator.

```
                   Free tier (≤120 req/min)
Client ──────────────────────────────────────► API (200 OK)

                   Over free tier, no payment
Client ──────────────────────────────────────► API (402 Payment Required)
       ◄─── PAYMENT-REQUIRED header ──────────

                   Over free tier, with payment
Client ──── Payment-Signature header ────────► API (verify → 200 OK → settle on-chain)
```

## Architecture

The facilitator runs **in-process** — no separate service required. A single API server instance handles both request serving and payment settlement.

| Component                | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `x402ResourceServer`     | Parses and validates payment headers              |
| `x402Facilitator`        | Verifies EIP-3009 signatures and settles on-chain |
| `toFacilitatorEvmSigner` | Wraps a viem wallet client for the facilitator    |
| `paymentMiddleware`      | Express middleware from `@x402/express`           |

### On-chain details

|                 | Value                                                      |
| --------------- | ---------------------------------------------------------- |
| Chain           | Arbitrum One                                               |
| CAIP-2 network  | `eip155:42161`                                             |
| Asset           | Native USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) |
| Transfer method | EIP-3009 `transferWithAuthorization`                       |
| Payment scheme  | `exact`                                                    |

## Tiered Rate Limiting

The middleware stack runs in this order for every request:

```
Request
  │
  ▼
helmet / json / cors          (base middleware)
  │
  ▼
freeTierLimiter (120 req/min) → sets req.requiresPayment=true if exceeded
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

| Tier | Requests/min | Behavior                                                         |
| ---- | ------------ | ---------------------------------------------------------------- |
| Free | 0–120        | Requests pass through normally                                   |
| Paid | >120         | Requires valid USDC payment (credit bundle) for continued access |

## Credit Sessions

After a successful x402 payment, the API creates a **credit session** — a server-side balance of credits tied to a session token. Sessions never expire; they persist until credits are exhausted.

Each bundle purchase grants `X402_CREDIT_BUNDLE_SIZE` credits (default 10,000). GraphQL query complexity is divided by 100 to determine the credit cost (minimum 1 credit per request). When credits run out, the client receives a 402 response prompting another payment.

### Credit cost examples

| Query type                 | Raw complexity | Credit cost | Requests per $1 bundle |
| -------------------------- | -------------- | ----------- | ---------------------- |
| Simple query               | ~100           | 1           | ~10,000                |
| Medium query               | ~1,000         | 10          | ~1,000                 |
| Complex aggregation        | ~5,000         | 50          | ~200                   |
| Heavy aggregation (`_all`) | ~10,000        | 100         | ~100                   |
| Non-GraphQL request        | N/A            | 1           | ~10,000                |

On complexity calculation error, the minimum cost (1 credit) is charged — the query will fail at the GraphQL layer if it's truly malformed.

### Complexity scoring examples

| Field                                    | Cost                     |
| ---------------------------------------- | ------------------------ |
| Regular fields                           | 1 (default)              |
| `__type`                                 | 50                       |
| `__schema`                               | 100                      |
| `questions`                              | 100 + (8 + child) × take |
| `accountTotalVolume`                     | 500                      |
| `accountProfitRank`                      | 2,000                    |
| `protocolStats`                          | 2,000                    |
| `profitLeaderboard`                      | 2,000                    |
| `_count`, `_sum`, `_avg`, `_min`, `_max` | 5,000                    |
| `_all`                                   | 10,000                   |

List fields multiply their children's cost by the requested list size (capped at `GRAPHQL_MAX_LIST_SIZE`). Some fields (like `questions`) handle list scaling internally via their own formula and bypass the list multiplier.

## Gas Guard

Before requiring payment, the middleware checks the current Arbitrum gas price. If estimated settlement gas cost exceeds the payment amount, it returns **503** instead of 402 to avoid unprofitable settlements.

```
Gas cost > payment amount → 503 Service Temporarily Unavailable
                            (retryAfter: 300 seconds)
```

Settlement gas is estimated at 80,000 units (EIP-3009 `transferWithAuthorization`). ETH/USD rate is fetched from Chainlink (cached 60s, falls back to $3,000). On gas price check failure, it fails open (assumes gas is affordable).

## Environment Variables

| Variable                       | Required                 | Default                        | Description                                                                                                                 |
| ------------------------------ | ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `X402_PAY_TO`                  | Yes (to enable)          | `''`                           | EVM address that receives USDC payments. If empty, x402 is disabled and only the free tier limiter runs.                    |
| `X402_FACILITATOR_PRIVATE_KEY` | Yes (if X402_PAY_TO set) | `''`                           | Private key for the facilitator wallet. This wallet submits settlement transactions — fund it with ETH on Arbitrum for gas. |
| `X402_ARBITRUM_RPC_URL`        | No                       | `https://arb1.arbitrum.io/rpc` | Arbitrum One RPC endpoint.                                                                                                  |
| `FREE_TIER_RATE_LIMIT`         | No                       | `120`                          | Max requests/min before payment is required.                                                                                |
| `X402_CREDIT_BUNDLE_USDC`      | No                       | `1000000`                      | USDC price per credit bundle in base units (6 decimals).                                                                    |
| `X402_CREDIT_BUNDLE_SIZE`      | No                       | `10000`                        | Number of credits granted per bundle purchase.                                                                              |

## File Layout

| File                             | Responsibility                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/x402.ts`                    | In-process facilitator, complexity-based pricing, gas guard, payment middleware creation |
| `src/middleware.ts`              | CORS, helmet, rate limiters, x402 handler wiring, admin auth                             |
| `src/creditSessions.ts`          | Credit session CRUD — create, get, deduct credits                                        |
| `src/app.ts`                     | Express app factory — calls `setupMiddleware`, mounts router                             |
| `src/config.ts`                  | Environment variable definitions (x402 + rate limit configs)                             |
| `src/graphql/queryComplexity.ts` | Shared `createComplexityEstimators()` used by both Apollo validation and x402 pricing    |
| `src/scripts/testX402Payment.ts` | End-to-end payment test script (`pnpm test:x402`)                                        |
| `src/middleware.test.ts`         | Unit tests for the two-tier rate limiting system and credit sessions                     |

## CORS

Payment-related headers are configured in `corsOptions`:

- **Allowed**: `Payment-Signature` (client sends signed payment), `X-Credit-Session` (client sends session token)
- **Exposed**: `PAYMENT-REQUIRED`, `PAYMENT-RESPONSE`, `X-PAYMENT-RESPONSE`, `X-Credit-Session`, `X-Credit-Session-Status`, `X-Credit-Session-Error`, `X-Credits-Remaining`

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
