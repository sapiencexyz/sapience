# Market Maker Starter

A minimal auction maker bot that:
- Connects to the auction relayer WebSocket
- Prepares collateral for trading (wraps native USDe to WUSDe and approves)
- Verifies auctions use the expected resolver (`predictionMarketLZConditionalTokensResolver` from SDK)
- Bids a fixed amount on auctions whose maker position size meets a minimum
- Signs bids with EIP-712 using a private key

## Setup

1) Install deps in this starter directory:

```bash
cd starters/market-maker && pnpm install
```

2) Create an `.env` next to `src/index.ts` (or export envs in your shell):

```bash
# Required
PRIVATE_KEY=__YOUR_PRIVATE_KEY__

# Optional: RPC URL (defaults to https://rpc.ethereal.trade)
# RPC_URL=https://rpc.ethereal.trade

# Optional: Override contract addresses (defaults resolved from @sapience/sdk)
# VERIFYING_CONTRACT=0x...
# COLLATERAL_TOKEN=0x...

# Strategy
BID_AMOUNT=0.01
MIN_MAKER_POSITION_SIZE=10
DEADLINE_SECONDS=60
```

Alternatively, copy `env.example` to `.env` and fill in values.

3) Run (dev uses local SDK by default):

```bash
pnpm dev
```

Or, to test against the published SDK instead of local:

```bash
pnpm dev:published
```

## How It Works

On Ethereal, the native token is USDe but prediction market contracts expect WUSDe (Wrapped USDe) as collateral. The bot automatically:
1. Wraps native USDe to WUSDe using the SDK's `prepareForTrade`
2. Approves WUSDe for the PredictionMarket contract
3. Waits for each transaction to confirm before proceeding

## Notes

- Amounts assume 18 decimals (USDe-style).
- Collateral is prepared per-bid using `prepareForTrade`.
- Code is intentionally simple and centralized in `src/index.ts` for easy hacking. Shared pieces (like EIP-712 signing) live in `@sapience/sdk`.
