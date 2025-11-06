# Market Maker Starter

A minimal auction maker bot that:
- Connects to the auction relayer WebSocket
- Approves MAX ERC-20 allowance for the PredictionMarket contract on startup
- Bids a fixed amount on auctions whose maker wager meets a minimum
- Signs bids with EIP-712 using a private key

## Setup

1) Install deps in this starter directory:

```bash
cd starters/market-maker && pnpm install
```

2) Create an `.env` next to `src/index.ts` (or export envs in your shell):

```bash
RELAYER_WS_URL=wss://api.sapience.xyz/auction
# Optional: RPC_URL (defaults to a public RPC for CHAIN_ID)
RPC_URL=
# Optional: CHAIN_ID (defaults to Arbitrum One: 42161)
CHAIN_ID=
PRIVATE_KEY=__YOUR_PRIVATE_KEY__
# Optional overrides (defaults resolved from SDK)
# VERIFYING_CONTRACT=0xb04841cad1147675505816e2ec5c915430857b40
# COLLATERAL_TOKEN=0xfeb8c4d5efbaff6e928ea090bc660c363f883dba
# Strategy
BID_AMOUNT=0.01
MIN_MAKER_WAGER=10
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

## Notes

- Amounts assume 18 decimals (USDe-style).
- Approval is one-time to MAX (2^256-1).
- Code is intentionally simple and centralized in `src/index.ts` for easy hacking. Shared pieces (like EIP-712 signing) live in `@sapience/sdk`.
