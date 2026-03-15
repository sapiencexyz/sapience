# Market Maker Starter

> **Important:** The built-in strategies (Pyth Black-Scholes, Polymarket Gamma) are
> intentionally simple starting points to demonstrate the strategy interface. They
> lack risk management, position tracking, inventory limits, and many other features
> you would want before running with real capital. Treat them as scaffolding to build
> on, not production-ready pricing logic.

A standalone auction market maker bot. Lives in `starters/market-maker/`, separate from the main monorepo packages.

## Build & Run

```bash
# SDK must be built first (market maker imports from it)
pnpm --filter @sapience/sdk run build:lib

# Install deps and run
cd starters/market-maker
pnpm install
pnpm dev          # uses local SDK
pnpm dev:published # uses published SDK
```

## Architecture

- **`src/index.ts`** — entry point. Connects to relayer via SDK's `createEscrowAuctionWs()`, receives auctions, routes picks to strategies, computes combo quotes, signs and submits bids.
- **`src/strategies/types.ts`** — `Strategy` interface. Each strategy implements `matchesResolver()` and `getYesProbability()`.
- **`src/strategies/PythStrategy.ts`** — prices Pyth binary option markets using Black-Scholes. Fetches spot from Pyth Hermes API. Key params: volatility, feed map.
- **`src/strategies/PolymarketStrategy.ts`** — prices Conditional Tokens markets using Polymarket Gamma API YES price.
- **`src/sdk.ts`** — dynamic loader for `prepareForTrade` (Ethereal USDe wrapping).

## Key SDK Dependencies

The market maker imports from these SDK subpaths:

- `@sapience/sdk/constants` — chain IDs, chain configs, collateral addresses
- `@sapience/sdk/contracts/addresses` — resolver addresses, escrow contract addresses
- `@sapience/sdk/queries` — `fetchConditionsByIdsQuery`, `ConditionById` type
- `@sapience/sdk/auction/encoding` — `decodePythMarketId`, `decodePythLazerFeedId`
- `@sapience/sdk/auction/escrowSigning` — `buildCounterpartyMintTypedData`
- `@sapience/sdk/relayer/escrowAuctionWs` — `createEscrowAuctionWs`, `buildBidPayload`

If you modify SDK types used here, rebuild the SDK before checking this package.

## Quoting Math

- Each pick gets P(YES) from its strategy
- Combo: `predictorWinProb = Π(pickSuccessProb)`
- Fair bid: `predictorCollateral × P(cp wins) / P(predictor wins)`
- Applied edge: `bid = fairBid × (1 − EDGE_BPS / 10000)`

## Adding Strategies

Implement the `Strategy` interface in a new file under `src/strategies/`, then register in `src/index.ts`. Match on the resolver address to route picks.

## Auction Validation

The market maker uses `validateAuctionRFQ` from `@sapience/sdk/auction/validation`
to validate incoming auctions. This replaces the previous ad-hoc chain check +
unsigned check + manual signature verification (~40 lines collapsed to one call).
This is the same function the relayer and trading terminal use.

```ts
import { validateAuctionRFQ } from '@sapience/sdk/auction/validation';

const result = await validateAuctionRFQ(auction, {
  verifyingContract: ESCROW_ADDRESS,
  chainId: CHAIN_ID,
  requireSignature: REQUIRE_INTENT_SIGNATURE,
});
if (result.status !== 'valid') {
  logger.info(`Skipped: ${result.reason}`);
  return;
}
```

The min wager check and other business logic filters stay in the market maker —
they are not validation concerns.
