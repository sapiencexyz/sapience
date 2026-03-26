# Market Maker Starter

**This project is designed to be used with AI coding agents.** Point [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://openai.com/index/introducing-codex/), Cursor, or any code-aware LLM at this directory and ask it to build your strategy. The `AGENTS.md` file provides full architectural context so agents can navigate and extend the codebase autonomously.

A pluggable auction market maker that connects to the Sapience relayer and dynamically quotes prediction market auctions using pricing strategies.

> [!WARNING]
> The built-in strategies are simple starting points designed to demonstrate
> the strategy interface and get you up and running quickly. They use basic models
> (single-parameter Black-Scholes for Pyth, raw Gamma API mid-price for Polymarket)
> and **do not include risk management, position sizing, inventory tracking, exposure
> limits, or correlation handling.** You should build on top of these foundations with
> your own pricing logic and risk controls before deploying with real capital.

**Built-in strategies:**

- **Pyth** — prices binary option markets (over/under) using Black-Scholes with live spot prices from Pyth Hermes
- **Polymarket** — prices Conditional Tokens markets using Polymarket's Gamma API YES/NO prices

The bot automatically routes each auction leg to the correct strategy based on the condition resolver address, computes combo probabilities, and applies a configurable edge.

## Quick Start

```bash
# 1. Install dependencies (from repo root)
pnpm install

# 2. Build the SDK (market maker depends on it)
pnpm --filter @sapience/sdk run build:lib

# 3. Copy env and add your private key
cd starters/market-maker
cp env.example .env
# Edit .env — at minimum set PRIVATE_KEY

# 4. Run
pnpm dev
```

Without a `PRIVATE_KEY`, the bot runs in **dry-run mode** — it connects, receives auctions, and logs what it would bid, but doesn't sign or submit.

## Configuration

All config is via environment variables. See [`env.example`](./env.example) for the full list.

### Required

| Variable      | Description                                         |
| ------------- | --------------------------------------------------- |
| `PRIVATE_KEY` | Hex private key for signing bids (omit for dry-run) |

### Pricing

| Variable          | Default | Description                                     |
| ----------------- | ------- | ----------------------------------------------- |
| `EDGE_BPS`        | `200`   | Edge over fair value in basis points (200 = 2%) |
| `MAX_BID_AMOUNT`  | `1.0`   | Maximum bid in ether units                      |
| `VOLATILITY`      | `0.80`  | Annualized vol for Pyth Black-Scholes pricing   |
| `MIN_CP_WIN_PROB` | `0.05`  | Skip if counterparty win probability below this |

### Filtering

| Variable                  | Default | Description                                          |
| ------------------------- | ------- | ---------------------------------------------------- |
| `MIN_MAKER_POSITION_SIZE` | `10`    | Ignore auctions with predictor collateral below this |
| `DEADLINE_SECONDS`        | `60`    | Bid deadline in seconds from now                     |
| `SPONSOR_ALLOWLIST`       | _(all)_ | Comma-separated sponsor addresses to accept          |

### Network

| Variable         | Default                              | Description                  |
| ---------------- | ------------------------------------ | ---------------------------- |
| `CHAIN_ID`       | `5064014`                            | Chain ID (default: Ethereal) |
| `RPC_URL`        | _(from SDK)_                         | RPC endpoint                 |
| `RELAYER_WS_URL` | `wss://relayer.sapience.xyz/auction` | Relayer WebSocket URL        |

## How It Works

1. **Connect** — opens a WebSocket to the auction relayer using the SDK client
2. **Receive auction** — relayer broadcasts new auctions with picks (market legs)
3. **Route picks** — each pick's `conditionResolver` address is matched to a strategy
4. **Price** — strategies return P(YES) for each leg; the bot multiplies for combo probability
5. **Quote** — `fairBid = predictorCollateral × P(cp wins) / P(predictor wins) × (1 − edge)`
6. **Sign & submit** — EIP-712 typed data signature, sent back to relayer

On Ethereal, the native token is USDe but contracts expect WUSDe. The bot automatically wraps and approves via the SDK's `prepareForTrade`.

## Adding a Strategy

1. Create a new file in `src/strategies/` implementing the `Strategy` interface from `types.ts`
2. Register it in `src/index.ts` alongside the existing strategies
3. Map the resolver address — either hardcode it or resolve from the SDK

See [`PythStrategy.ts`](./src/strategies/PythStrategy.ts) and [`PolymarketStrategy.ts`](./src/strategies/PolymarketStrategy.ts) for examples with inline documentation of customization points.

## Project Structure

```
src/
├── index.ts                    # Main entry — WebSocket listener, auction handler, quoting
├── sdk.ts                      # Dynamic SDK loader for prepareForTrade
└── strategies/
    ├── types.ts                # Strategy interface (uses SDK's ConditionById type)
    ├── PythStrategy.ts         # Black-Scholes binary option pricing via Pyth
    └── PolymarketStrategy.ts   # Gamma API YES price as fair probability
```
