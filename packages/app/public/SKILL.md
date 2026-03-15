---
name: sapience
version: 0.4.0
description: Prediction markets on Ethereal + forecasting on Arbitrum. Use when the user wants to trade prediction market outcomes, submit probability forecasts, check market prices or positions, provide liquidity as a market maker, buy/sell positions on secondary market, or claim winnings. Supports EIP-712 signed auctions via WebSocket and on-chain settlement.
metadata:
  category: trading
  emoji: '🎯'
  api_base: 'https://api.sapience.xyz'
  homepage: 'https://sapience.xyz'
  docs: 'https://docs.sapience.xyz'
---

# Sapience

Prediction markets on Ethereal (chain `5064014`) + forecasting on Arbitrum (chain `42161`). Collateral: WUSDe (18 decimals).

**CRITICAL: Blockchain transactions are irreversible.** Never expose private keys or sign messages for unrecognized domains. Only sign EIP-712 messages for Sapience contracts (domains: `PredictionMarketEscrow`, `SecondaryMarketEscrow`). Always double-check amounts, addresses, and signatures before submitting. When in doubt, confirm with the user before executing any on-chain action.

> **Always use the latest skill.** If you run into issues, re-fetch from [sapience.xyz/SKILL.md](https://sapience.xyz/SKILL.md).

## Quick Reference

| Action                    | Method              | Details                                                               |
| ------------------------- | ------------------- | --------------------------------------------------------------------- |
| Submit forecast           | On-chain (Arbitrum) | `EAS.attest()` — free, ranked on leaderboard                          |
| List markets              | POST `/graphql`     | `questions` query — search, sort, filter                              |
| Get positions             | POST `/graphql`     | `positions` query                                                     |
| Start auction (taker)     | WS                  | `wss://relayer.sapience.xyz/auction`                                  |
| Submit bid (maker)        | WS                  | `wss://relayer.sapience.xyz/auction`                                  |
| Sell position (secondary) | WS                  | `secondary.auction.start` — [details](references/secondary-market.md) |
| Buy position (secondary)  | WS                  | `secondary.bid.submit` — [details](references/secondary-market.md)    |
| Settle prediction         | On-chain (Ethereal) | `PredictionMarketEscrow.settle()`                                     |
| Claim winnings            | On-chain (Ethereal) | `PredictionMarketEscrow.redeem()`                                     |

## Setup

You need a wallet (any EOA or smart account) to interact with Sapience. How the wallet is managed — private key, browser extension, hardware wallet, smart account — is determined by the user's setup.

> **Forecasting only?** Just need a tiny amount of ETH on Arbitrum for gas (~$0.01 per forecast). No USDe, bridging, or wrapping needed. See [Forecasting](#forecasting-arbitrum).

**For trading on Ethereal:**

1. Acquire USDe (swap on any DEX or use [Bankr](https://github.com/BankrBot/skills))
2. Bridge to Ethereal via Stargate — see [Bridging reference](references/bridging.md). On Ethereal, USDe is the native gas token — no separate ETH needed.
3. Wrap USDe to WUSDe and approve the escrow contract

**Ethereal Chain Info:** Chain ID `5064014` | RPC `https://rpc.ethereal.trade` | Explorer `https://explorer.ethereal.trade` | Native token: USDe (18 decimals)

### Wrapping and Approval

Contracts require WUSDe (wrapped USDe). Call `WUSDe.deposit()` with USDe value to wrap, then `WUSDe.approve(escrow, amount)`.

**SDK convenience helper** (if you have a raw private key):

```javascript
import { prepareForTrade } from '@sapience/sdk';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const { ready, wrapTxHash, approvalTxHash } = await prepareForTrade({
  privateKey: '0x...',
  collateralAmount: 50000000000000000000n, // 50 USDe
  spender: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
});
```

## Getting Started

If the user is new to prediction markets, help them build intuition before risking money:

1. **Explore markets** — Query active markets (`questions` API) and discuss what's interesting.
2. **Develop a thesis** — For any market: _What's the probability, and why?_ Research the question using news, data, base rates, and expert opinions.
3. **Start with forecasts** — Free (~$0.01 gas). Builds a track record and calibration skill. See [Forecasting](#forecasting-arbitrum).
4. **Compare to market prices** — Check Polymarket prices. Where does the user disagree? A well-reasoned disagreement is an edge.
5. **Size positions carefully** — Start small. Never risk more than affordable to lose. Think about position sizing relative to confidence.

The best prediction market participants are researchers first and traders second.

## Constants

All contract addresses from `@sapience/sdk/contracts/addresses`:

```javascript
import {
  predictionMarketEscrow, // core escrow (mint, settle, redeem)
  collateralToken, // WUSDe
  secondaryMarketEscrow, // secondary market OTC trades
  pythConditionResolver, // Pyth oracle resolver
  eas, // EAS (Arbitrum, for forecasting)
} from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants';

const escrowAddress = predictionMarketEscrow[CHAIN_ID_ETHEREAL].address;
const wusdeAddress = collateralToken[CHAIN_ID_ETHEREAL].address;
```

| Contract                  | Chain              | SDK Key                              |
| ------------------------- | ------------------ | ------------------------------------ |
| PredictionMarketEscrow    | Ethereal (5064014) | `predictionMarketEscrow`             |
| WUSDe (Collateral)        | Ethereal (5064014) | `collateralToken`                    |
| SecondaryMarketEscrow     | Ethereal (5064014) | `secondaryMarketEscrow`              |
| PythConditionResolver     | Ethereal (5064014) | `pythConditionResolver`              |
| ConditionalTokensResolver | Ethereal (5064014) | `conditionalTokensConditionResolver` |
| EAS                       | Arbitrum (42161)   | `eas`                                |

Chain helpers: `etherealChain` (full viem Chain object) and `getRpcUrl(chainId)` from `@sapience/sdk/constants`.

## Core Concepts

- **Condition**: A market question with YES/NO outcome. Each condition has a `resolver` address (from GraphQL) that determines settlement. Conditions can be Polymarket mirrors (resolved via LayerZero) or Pyth binary options (price Over/Under, resolved by oracle — see [Pyth reference](references/pyth-binary-options.md)).
- **Pick**: `{conditionResolver, conditionId, predictedOutcome}` — a single prediction. `predictedOutcome`: `0` = YES, `1` = NO. Use the condition's `resolver` field from GraphQL as `conditionResolver`.
- **Pick Configuration (pickConfigId)**: A set of picks sharing fungible position tokens. Multiple picks = a combo. `pickConfigId = keccak256(abi.encode(picks))` — compute with `computePickConfigId(canonicalizePicks(picks))` from `@sapience/sdk/auction/escrowEncoding`.
- **Position Tokens**: ERC20 pairs (predictor + counterparty) per pick config. Winning side redeems for collateral. Get addresses via `positions` query.
- **Forecast**: EAS attestation on Arbitrum with probability estimate (0-100%). No money involved. Scored on accuracy.
- **Collateral amounts**: All collateral fields are **total amounts in WUSDe wei** (18 decimals), not per-token prices.

## GraphQL Queries

Interactive sandbox: [api.sapience.xyz/graphql](https://api.sapience.xyz/graphql)

### List Markets

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ questions(take:50, sortField:openInterest, sortDirection:desc, resolutionStatus:unresolved) { questionType group { id name conditions { id question shortName endTime resolver settled resolvedToYes openInterest similarMarkets categoryId } } condition { id question shortName endTime resolver settled resolvedToYes openInterest similarMarkets categoryId } } }"}'
```

**Arguments:**

- `take` (Int, default 50), `skip` (Int, default 0) — pagination
- `sortField` — `openInterest`, `endTime`, `createdAt`, `predictionCount`
- `sortDirection` — `asc` or `desc`
- `search` (String) — full-text search
- `categorySlugs` ([String]) — filter by category
- `resolutionStatus` — `all`, `unresolved`, `resolved`, `resolvedYes`, `resolvedNo`
- `minEndTime` (Int) — minimum end time in unix seconds
- `chainId` (Int) — filter by chain

Each condition includes a `resolver` field — use this as `conditionResolver` when building picks.

### Get Condition Details

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($where:ConditionWhereUniqueInput!){ condition(where:$where){ id question shortName description endTime resolver settled resolvedToYes openInterest similarMarkets categoryId }}","variables":{"where":{"id":"0x..."}}}'
```

### Get Positions

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($holder:String!){ positions(holder:$holder){ tokenAddress pickConfigId isPredictorToken balance pickConfig { resolved result picks { conditionResolver conditionId predictedOutcome } } } }","variables":{"holder":"0x..."}}'
```

### Get Predictions

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($address:String!,$settled:Boolean){ predictions(address:$address,settled:$settled){ predictionId predictor counterparty predictorCollateral counterpartyCollateral settled result predictorToken counterpartyToken }}","variables":{"address":"0x...","settled":false}}'
```

### Accuracy Leaderboard

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($limit:Int!){ accuracyLeaderboard(limit:$limit){ address accuracyScore numTimeWeighted }}","variables":{"limit":50}}'
```

### Your Forecasting Rank

```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($address:String!){ accountAccuracyRank(address:$address){ accuracyScore rank totalForecasters }}","variables":{"address":"0x..."}}'
```

## Polymarket Prices

Sapience markets mirror Polymarket. Use `similarMarkets` URLs to get prices.

### Extract Slug from URL

```
https://polymarket.com/event/slug-name#outcome -> slug: "slug-name"
```

### Get Market Data

```bash
curl "https://gamma-api.polymarket.com/markets/slug/<slug>"
```

Response: `outcomePrices` (YES/NO prices), `outcomes`, `clobTokenIds` (for orderbook).

### Get Orderbook

```bash
curl "https://clob.polymarket.com/book?token_id=<clobTokenId>"
```

### Price History

```bash
curl "https://clob.polymarket.com/prices-history?market=<clobTokenId>&startTs=<unix_ts>&fidelity=60"
```

No auth required for Polymarket APIs.

## Forecasting (Arbitrum)

Submit probability estimates (0-100%) as EAS attestations on Arbitrum. No money required — only gas (~$0.01). Scored using Inverted Horizon-Weighted Brier Score. Earlier, more accurate forecasts score higher.

### Submit a Forecast

Build calldata and submit with any Arbitrum wallet:

```javascript
import { buildForecastCalldata } from '@sapience/sdk';
import { pythConditionResolver } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const calldata = buildForecastCalldata(
  pythConditionResolver[CHAIN_ID_ETHEREAL].address, // resolver
  '0x<conditionId>', // condition
  75, // probability 0-100
  'Optional reasoning' // max 180 chars
);
// calldata.to = EAS contract, calldata.data = encoded attest(), calldata.chainId = 42161
```

**Convenience helper** (requires raw private key):

```javascript
import { submitForecast } from '@sapience/sdk';
const { hash } = await submitForecast({
  resolver: pythConditionResolver[CHAIN_ID_ETHEREAL].address,
  condition: '0x<conditionId>',
  probability: 75,
  comment: 'Reasoning here',
  privateKey: '0x...',
});
```

**Scoring:** `avg((1 - brierScore) * timeWeight)`. Score of 1.0 is perfect; 0.0 is worst.

## WebSocket — Taker Flow (Making Predictions)

Connect -> sign intent -> start auction -> receive bids -> sign MintApproval -> mint on-chain.

### 1. Connect

```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Build Picks

```javascript
const picks = [
  {
    conditionResolver: '0x...', // `resolver` field from condition query
    conditionId: '0x...', // `id` field from condition query
    predictedOutcome: 0, // 0 = YES, 1 = NO
  },
];
// For combos, add more picks to the array
```

Use `canonicalizePicks(picks)` from `@sapience/sdk/auction/escrowEncoding` to sort into canonical order (required for consistent hashing).

### 3. Sign AuctionIntent (EIP-712)

Lightweight relayer-auth signature proving identity and intent. NOT verified on-chain.

```javascript
import { buildAuctionIntentTypedData } from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const escrowAddress = predictionMarketEscrow[CHAIN_ID_ETHEREAL].address;

const typedData = buildAuctionIntentTypedData({
  picks,
  predictor: wallet.address,
  predictorCollateral: 50000000000000000000n,
  predictorNonce: BigInt(Date.now()),
  predictorDeadline: BigInt(Math.floor(Date.now() / 1000) + 300),
  verifyingContract: escrowAddress,
  chainId: CHAIN_ID_ETHEREAL,
});

const intentSignature = await wallet.signTypedData(typedData);
```

### 4. Send `auction.start`

```javascript
ws.send(
  JSON.stringify({
    type: 'auction.start',
    payload: {
      picks: picks.map((p) => ({
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
      predictorCollateral: '50000000000000000000', // wei string
      predictor: wallet.address,
      predictorNonce: nonce,
      predictorDeadline: deadline,
      intentSignature: intentSignature,
      chainId: 5064014,
    },
  })
);
```

### 5. Receive `auction.ack`

```json
{ "type": "auction.ack", "payload": { "auctionId": "abc123" } }
```

### 6. Receive `auction.bids`

```json
{
  "type": "auction.bids",
  "payload": {
    "auctionId": "abc123",
    "bids": [
      {
        "counterparty": "0x...",
        "counterpartyCollateral": "25000000000000000000",
        "counterpartyNonce": 1706800000,
        "counterpartyDeadline": 1706800060,
        "counterpartySignature": "0x...",
        "receivedAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 7. Accept Bid — Sign MintApproval and Mint

Select the best bid, sign your `MintApproval`, and call `PredictionMarketEscrow.mint()` on-chain. See [Minting On-Chain](#minting-on-chain) and [EIP-712 reference](references/eip712-signing.md).

Both taker and maker must have approved the PredictionMarketEscrow contract to spend their WUSDe.

### 8. Receive `auction.filled` or `auction.expired`

```json
{
  "type": "auction.filled",
  "payload": {
    "auctionId": "abc123",
    "predictionId": "0x...",
    "pickConfigId": "0x...",
    "transactionHash": "0x..."
  }
}
```

SDK helper: `createEscrowAuctionWs()` from `@sapience/sdk/relayer/escrowAuctionWs` handles connection, reconnection, and typed message routing.

## WebSocket — Maker Flow (Providing Liquidity)

Listen for auctions, sign counterparty MintApproval, submit bids. No auth to listen.

### 1. Connect

```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Receive `auction.started`

```json
{
  "type": "auction.started",
  "payload": {
    "auctionId": "abc123",
    "picks": [
      {
        "conditionResolver": "0x...",
        "conditionId": "0x...",
        "predictedOutcome": 0
      }
    ],
    "predictorCollateral": "50000000000000000000",
    "predictor": "0x...",
    "predictorNonce": 1706800000,
    "predictorDeadline": 1706800300,
    "chainId": 5064014,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 3. Sign MintApproval (EIP-712)

```javascript
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const typedData = buildCounterpartyMintTypedData({
  picks: canonicalizePicks(auctionPicks),
  predictorCollateral: BigInt(auction.predictorCollateral),
  counterpartyCollateral: 25000000000000000000n, // your collateral (you set the price)
  predictor: auction.predictor,
  counterparty: wallet.address,
  counterpartyNonce: BigInt(Date.now()),
  counterpartyDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
  predictorSponsor: '0x0000000000000000000000000000000000000000',
  predictorSponsorData: '0x',
  verifyingContract: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  chainId: CHAIN_ID_ETHEREAL,
});

const counterpartySignature = await wallet.signTypedData(typedData);
```

### 4. Send `bid.submit`

```javascript
ws.send(
  JSON.stringify({
    type: 'bid.submit',
    payload: {
      auctionId: 'abc123',
      counterparty: wallet.address,
      counterpartyCollateral: '25000000000000000000',
      counterpartyNonce: nonce,
      counterpartyDeadline: deadline,
      counterpartySignature: counterpartySignature,
    },
  })
);
```

### 5. Receive `bid.ack`

```json
{ "type": "bid.ack", "payload": { "bidId": "xyz789" } }
```

On error: `{"type":"bid.ack","payload":{"error":"auction_not_found_or_expired"}}`

If the taker accepts your bid, they call `mint()` on-chain.

## Secondary Market Trading

Trade existing position tokens before settlement via atomic OTC swaps on `SecondaryMarketEscrow`. Same WebSocket endpoint as primary market.

**Quick overview:** Sellers start an auction listing position tokens. Buyers submit bids with signed TradeApprovals. Seller picks the best bid, re-signs with the actual buyer address, and calls `executeTrade()` on-chain.

For the full seller flow, buyer flow, and EIP-712 details, see **[Secondary Market reference](references/secondary-market.md)**.

Key SDK imports: `buildSellerTradeApproval`, `buildBuyerTradeApproval`, `computeTradeHash` from `@sapience/sdk/auction/secondarySigning`.

## Minting On-Chain

`PredictionMarketEscrow.mint(MintRequest)`:

```javascript
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

await walletClient.writeContract({
  address: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: predictionMarketEscrowAbi,
  functionName: 'mint',
  args: [
    {
      picks: canonicalPicks,
      predictorCollateral: 50000000000000000000n,
      counterpartyCollateral: 25000000000000000000n,
      predictor: '0x...',
      counterparty: '0x...',
      predictorNonce: predictorNonce,
      counterpartyNonce: counterpartyNonce,
      predictorDeadline: predictorDeadline,
      counterpartyDeadline: counterpartyDeadline,
      predictorSignature: '0x...',
      counterpartySignature: '0x...',
      refCode: '0x' + '0'.repeat(64),
      predictorSessionKeyData: '0x',
      counterpartySessionKeyData: '0x',
      predictorSponsor: '0x0000000000000000000000000000000000000000',
      predictorSponsorData: '0x',
    },
  ],
});
```

Both parties must have approved the PredictionMarketEscrow to spend their WUSDe.

## EIP-712 Signing

All Sapience signing uses standard EIP-712 typed data. The SDK's `build*TypedData()` helpers return objects compatible with any EIP-712 signer — viem, ethers, browser wallets, hardware wallets, smart accounts.

**Primary market domain:** `PredictionMarketEscrow` (version `1`) on chain `5064014`
**Secondary market domain:** `SecondaryMarketEscrow` (version `1`) on chain `5064014`

Key types: `AuctionIntent` (relayer-only), `MintApproval` (on-chain), `TradeApproval` (secondary, on-chain).

For full type definitions and SDK helpers, see **[EIP-712 reference](references/eip712-signing.md)**.

## Nonces

Bitmap nonces (Permit2-style) — pick any unused value, no sequential requirement.

- **Check if used**: `PredictionMarketEscrow.isNonceUsed(address, nonce) -> bool`
- **Simple strategy**: use `Date.now()` or a random number

## Claiming Flow

Two-step: settle then redeem.

### 1. Query Positions

Use the `positions` query (see [GraphQL Queries](#get-positions)). Find positions where `pickConfig.resolved == false` (eligible to settle) or `pickConfig.resolved == true` with winning tokens (eligible to redeem).

### 2. Settle

```javascript
await walletClient.writeContract({
  address: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: predictionMarketEscrowAbi,
  functionName: 'settle',
  args: [predictionId, '0x' + '0'.repeat(64)],
});
```

Permissionless — anyone can call. Only needed once per pickConfigId.

### 3. Determine Winner

- `result == "PREDICTOR_WINS"` -> predictor token holders win
- `result == "COUNTERPARTY_WINS"` -> counterparty token holders win
- `result == "NON_DECISIVE"` -> tie, proportional split

### 4. Redeem

```javascript
await walletClient.writeContract({
  address: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: predictionMarketEscrowAbi,
  functionName: 'redeem',
  args: [positionTokenAddress, amount, '0x' + '0'.repeat(64)],
});
```

Burns position tokens and returns proportional collateral.

## Rate Limits

| Endpoint        | Limit                        |
| --------------- | ---------------------------- |
| GraphQL API     | 200 req / 60s per IP         |
| Auction WS      | 100 msg / 10s per connection |
| WS idle timeout | 300s                         |
| Max WS message  | 64KB                         |

Keep WebSocket alive with periodic pings: `ws.send(JSON.stringify({ type: 'ping' }));` → responds `{"type":"pong"}`

## Error Handling

**bid.ack errors** (`payload.error`):

- `auction_not_found_or_expired` — Auction ended or invalid auctionId
- `quote_expired` — counterpartyDeadline passed
- `invalid_signature` — Signature verification failed
- `invalid_maker_wager` — Collateral is zero/invalid

**secondary.bid.ack errors**: See [Secondary Market reference](references/secondary-market.md#error-handling).

**WS close codes:** `1008` = rate limited, `1009` = message too large

## SDK Import Reference

| Function                                                                                                                                   | Import Path                              |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `submitForecast`, `buildForecastCalldata`, `prepareForTrade`, `wrapUSDe`, `getWUSDEBalance`                                                | `@sapience/sdk`                          |
| `predictionMarketEscrow`, `collateralToken`, `secondaryMarketEscrow`, `pythConditionResolver`, `conditionalTokensConditionResolver`, `eas` | `@sapience/sdk/contracts/addresses`      |
| `CHAIN_ID_ETHEREAL`, `CHAIN_ID_ARBITRUM`, `etherealChain`, `getRpcUrl`                                                                     | `@sapience/sdk/constants`                |
| `predictionMarketEscrowAbi`, `secondaryMarketEscrowAbi`, `pythConditionResolverAbi`                                                        | `@sapience/sdk/abis`                     |
| `canonicalizePicks`, `computePickConfigId`                                                                                                 | `@sapience/sdk/auction/escrowEncoding`   |
| `getPythMarketId`, `encodePythBinaryOptionOutcomes`                                                                                        | `@sapience/sdk/auction/encoding`         |
| `buildAuctionIntentTypedData`, `buildPredictorMintTypedData`, `buildCounterpartyMintTypedData`                                             | `@sapience/sdk/auction/escrowSigning`    |
| `buildSellerTradeApproval`, `buildBuyerTradeApproval`, `computeTradeHash`                                                                  | `@sapience/sdk/auction/secondarySigning` |
| `createEscrowAuctionWs`                                                                                                                    | `@sapience/sdk/relayer/escrowAuctionWs`  |

## Troubleshooting

If something isn't working, check for skill updates:

```bash
curl -s https://sapience.xyz/SKILL.md | head -3
```

Current version: `0.4.0`. If newer exists, re-fetch from `https://sapience.xyz/SKILL.md`.

## Philosophy

This skill provides **infrastructure**, not strategy. Real money at stake (except forecasting, which is free).

- Encourage forecasting before trading — forecasts are free and build calibration
- Help the user research questions deeply before forming a view
- Encourage probabilistic thinking — "What's the probability, and what would change your mind?"
- Never trade on behalf of a user without explicit confirmation of the amount and direction
- Discuss position sizing relative to confidence and bankroll

DO NOT rely on any default strategy. DO NOT execute trades without the user understanding what they're doing.

## Further Reading

- Full builder docs: [docs.sapience.xyz](https://docs.sapience.xyz/)
- [Secondary Market Trading](references/secondary-market.md)
- [Pyth Binary Options](references/pyth-binary-options.md)
- [Bridging to Ethereal](references/bridging.md)
- [EIP-712 Signing Reference](references/eip712-signing.md)
