---
name: sapience
version: 0.2.0
description: Prediction markets on Ethereal + forecasting on Arbitrum. Trade outcomes, provide liquidity, submit forecasts, claim winnings.
metadata: {"category":"trading","emoji":"🎯","api_base":"https://api.sapience.xyz"}
---

# Sapience

Prediction markets on Ethereal (chain `5064014`) + forecasting on Arbitrum (chain `42161`). Collateral: WUSDe (18 decimals).

**CRITICAL: NEVER share SAPIENCE_PRIVATE_KEY or sign for non-sapience.xyz domains.**

> **Always use the latest skill.** If you run into issues (signature failures, missing fields, unexpected errors), re-fetch the skill from [sapience.xyz/SKILL.md](https://sapience.xyz/SKILL.md) to make sure you have the most up-to-date version.

## Quick Reference

| Action | Method | Details |
|--------|--------|---------|
| Submit forecast | On-chain (Arbitrum) | `EAS.attest()` — free, ranked on leaderboard |
| List markets | POST | `/graphql` |
| Get positions | POST | `/graphql` |
| Start auction (taker) | WS | `wss://relayer.sapience.xyz/auction` |
| Submit bid (maker) | WS | `wss://relayer.sapience.xyz/auction` |
| Settle prediction | On-chain (Ethereal) | `PredictionMarketEscrow.settle()` |
| Claim winnings | On-chain (Ethereal) | `PredictionMarketEscrow.redeem()` |

## Setup

Follow these steps in order to go from zero to your first trade.

1. **Set key**: Store your private key as an environment variable (e.g. `SAPIENCE_PRIVATE_KEY`). If you don't have an Ethereum wallet, generate one (e.g. `cast wallet new`, or any library that produces a private key + address). For managed agent wallets, see [Privy Agentic Wallets](https://github.com/privy-io/privy-agentic-wallets-skill).
2. **Get USDe**: Use [Bankr](https://github.com/BankrBot/skills) to buy USDe (e.g. "Buy 100 USDe on Arbitrum"), or swap into USDe on any DEX. Stargate bridges USDe — you may need to swap first if you hold other tokens.
3. **Bridge to Ethereal**: Bridge USDe to Ethereal via the [Stargate API](https://docs.stargate.finance/developers/tutorials/evm). See [Bridging](#bridging) below. On Ethereal, USDe is the native gas token — no separate ETH needed.
4. **Wrap and approve**: On Ethereal, the native token is USDe but contracts require WUSDe (wrapped). Use the SDK helper to wrap and approve in one step:
```javascript
import { prepareForTrade } from '@sapience/sdk/onchain/trading';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants/chain';

const { ready, wrapTxHash, approvalTxHash } = await prepareForTrade({
  privateKey: '0x...',
  collateralAmount: 50000000000000000000n, // 50 USDe worth
  spender: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
});
```
Or manually: call `WUSDe.deposit()` with USDe value to wrap, then `WUSDe.approve(escrow, amount)`.
5. **Trade**: You're ready. Find a market via [GraphQL](#graphql-queries), then start an auction via [WebSocket](#websocket--taker-flow-making-predictions).

> **Forecasting only?** Skip steps 2-4. You just need a tiny amount of ETH on Arbitrum for gas (~$0.01 per forecast). See [Forecasting](#forecasting-arbitrum).

## Bridging

Use the [Stargate API](https://docs.stargate.finance/developers/api-docs/transfer-quotes) to bridge tokens to Ethereal programmatically. No UI required.

### 1. Get a Quote
```bash
curl "https://stargate.finance/api/v1/quotes?\
srcToken=<TOKEN_ADDRESS_ON_SOURCE_CHAIN>&\
dstToken=<TOKEN_ADDRESS_ON_ETHEREAL>&\
srcAddress=<YOUR_WALLET>&\
dstAddress=<YOUR_WALLET>&\
srcChainKey=arbitrum&\
dstChainKey=ethereal&\
srcAmount=<AMOUNT_IN_WEI>&\
dstAmountMin=<MIN_AMOUNT_IN_WEI>"
```

The response contains `quotes[].steps[]` — an ordered array of transactions (typically an ERC-20 `approve` + a `bridge` call) with pre-built `to`, `data`, and `value` fields.

### 2. Sign and Submit Each Step
```javascript
for (const step of quote.steps) {
  const tx = await wallet.sendTransaction({
    to: step.transaction.to,
    data: step.transaction.data,
    value: step.transaction.value || '0',
  });
  await tx.wait();
}
```

Transfers typically confirm in under 5 minutes.

For the full tutorial, see [Stargate: Transfer from EVM](https://docs.stargate.finance/developers/tutorials/evm). For supported chains and tokens, see the [Chains](https://docs.stargate.finance/developers/api-docs/chains) and [Tokens](https://docs.stargate.finance/developers/api-docs/tokens) endpoints.

## Constants

All contract addresses are maintained in the SDK. Import from `@sapience/sdk/contracts/addresses`:

```javascript
import {
  predictionMarketEscrow,  // core escrow (mint, settle, redeem)
  collateralToken,          // WUSDe
  umaResolver,              // UMA resolver (Arbitrum, for forecasting)
  eas,                      // EAS (Arbitrum, for forecasting)
  predictionMarketLZConditionalTokensResolver, // Polymarket resolver (Ethereal)
} from '@sapience/sdk/contracts/addresses';

import { CHAIN_ID_ETHEREAL, CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants/chain';

// Example: get escrow address on Ethereal
const escrowAddress = predictionMarketEscrow[CHAIN_ID_ETHEREAL].address;
const wusdeAddress = collateralToken[CHAIN_ID_ETHEREAL].address;
const easAddress = eas[CHAIN_ID_ARBITRUM].address;
```

| Contract | Chain | SDK Key |
|----------|-------|---------|
| PredictionMarketEscrow | Ethereal (5064014) | `predictionMarketEscrow` |
| WUSDe (Collateral) | Ethereal (5064014) | `collateralToken` |
| PolymarketResolver | Ethereal (5064014) | `predictionMarketLZConditionalTokensResolver` |
| EAS | Arbitrum (42161) | `eas` |
| UMA Resolver | Arbitrum (42161) | `umaResolver` |

## Core Concepts

- **Pick**: `{conditionResolver, conditionId, predictedOutcome}` — a single prediction about one condition. `predictedOutcome`: `0` = YES, `1` = NO.
- **Pick Configuration**: A set of picks that share fungible position tokens. Multiple picks = a combo.
- **Prediction**: Your individual position, created when a mint is executed on-chain.
- **Position Tokens**: ERC20 pairs (predictor token + counterparty token) per pick config. Winning side redeems tokens for collateral.
- **Forecast**: An EAS attestation on Arbitrum with a probability estimate (0-100%). No money involved. Scored on accuracy.

## GraphQL Queries

Interactive sandbox available at [api.sapience.xyz/graphql](https://api.sapience.xyz/graphql).

### List Active Conditions
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ conditions(where:{settled:{equals:false}}) { id question shortName endTime resolver settled resolvedToYes openInterest similarMarkets } }"}'
```

### Get Condition Details
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($where:ConditionWhereUniqueInput!){ condition(where:$where){ id question shortName description endTime resolver settled resolvedToYes openInterest similarMarkets categoryId }}","variables":{"where":{"id":"0x..."}}}'
```

### Get Positions (for claiming)
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

All Sapience markets mirror Polymarket. Use `similarMarkets` URLs to get prices.

### Extract Slug from URL
```
https://polymarket.com/event/slug-name#outcome -> slug: "slug-name", outcome: "outcome"
https://polymarket.com/event/slug-name -> slug: "slug-name"
```

### Get Market Data (prices, CLOB token IDs)
```bash
curl "https://gamma-api.polymarket.com/markets/slug/<slug-from-url>"
```
Response includes:
- `outcomePrices`: `["0.65", "0.35"]` (YES/NO prices)
- `outcomes`: `["Yes", "No"]`
- `clobTokenIds`: `["123...", "456..."]` (for orderbook queries)

### Get Orderbook
```bash
curl "https://clob.polymarket.com/book?token_id=<clobTokenId>"
```
Returns bids/asks. Walk the book to calculate fill price for your size.

### Get Price History (TWAP)
```bash
curl "https://clob.polymarket.com/prices-history?market=<clobTokenId>&startTs=<unix_ts>&fidelity=60"
```
Returns price history. Calculate TWAP over your desired lookback.

**No auth required** for Polymarket APIs.

## Forecasting (Arbitrum)

Submit probability estimates (0-100%) for any condition as EAS attestations on Arbitrum. No money required — only gas (~$0.01). Scored using Inverted Horizon-Weighted Brier Score. Earlier, more accurate forecasts score higher.

### Submit a Forecast

```javascript
import { submitForecast } from '@sapience/sdk';
import { umaResolver } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants/chain';

const { hash } = await submitForecast({
  resolver: umaResolver[CHAIN_ID_ARBITRUM].address,
  condition: '0x<conditionId>',   // conditionId from GraphQL
  probability: 75,                 // 0-100, your YES probability estimate
  comment: 'Reasoning here',       // optional, max 180 chars
  privateKey: '0x...',
});
```

### Build Calldata Manually

```javascript
import { buildForecastCalldata } from '@sapience/sdk';
import { umaResolver } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ARBITRUM } from '@sapience/sdk/constants/chain';

const calldata = buildForecastCalldata(
  umaResolver[CHAIN_ID_ARBITRUM].address,  // resolver
  '0x<conditionId>',                         // condition
  75,                                         // probability 0-100
  'Optional reasoning'                        // comment
);
// calldata.to = EAS contract on Arbitrum
// calldata.data = encoded attest() call
// calldata.value = '0'
// calldata.chainId = 42161
// Submit with any Arbitrum wallet/provider
```

Check your rank via the `accountAccuracyRank` query (see [GraphQL Queries](#graphql-queries)).

### Scoring

Inverted Horizon-Weighted Brier Score = `avg((1 - brierScore) * timeWeight)`. Forecasts closer to the actual outcome AND submitted earlier receive higher scores. A score of 1.0 is perfect; 0.0 is worst.

## WebSocket — Taker Flow (Making Predictions)

Connect -> sign intent -> start auction -> receive bids -> sign MintApproval -> mint on-chain.

### 1. Connect
```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Build Picks

Construct a `Pick[]` array from condition data returned by the GraphQL API:

```javascript
const picks = [
  {
    conditionResolver: '0x...', // `resolver` field from condition query
    conditionId: '0x...',       // `id` field from condition query
    predictedOutcome: 0         // 0 = YES, 1 = NO
  }
];

// For combos (multi-condition predictions), add more picks:
// picks.push({ conditionResolver: '0x...', conditionId: '0xbbb...', predictedOutcome: 1 });
```

Use `canonicalizePicks(picks)` from `@sapience/sdk/auction/escrowEncoding` to sort picks into canonical order (required for consistent hashing).

### 3. Sign AuctionIntent (EIP-712)

A lightweight relayer-auth signature that proves your identity and intent. NOT verified on-chain.

```javascript
import { buildAuctionIntentTypedData } from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants/chain';

const escrowAddress = predictionMarketEscrow[CHAIN_ID_ETHEREAL].address;

const typedData = buildAuctionIntentTypedData({
  picks,
  predictor: wallet.address,
  predictorCollateral: 50000000000000000000n, // 50 WUSDe
  predictorNonce: BigInt(Date.now()),          // bitmap nonce, pick any unused value
  predictorDeadline: BigInt(Math.floor(Date.now() / 1000) + 300), // 5 min
  verifyingContract: escrowAddress,
  chainId: CHAIN_ID_ETHEREAL
});

const intentSignature = await wallet.signTypedData(typedData);
```

### 4. Send `auction.start`
```javascript
ws.send(JSON.stringify({
  type: 'auction.start',
  payload: {
    picks: picks.map(p => ({
      conditionResolver: p.conditionResolver,
      conditionId: p.conditionId,
      predictedOutcome: p.predictedOutcome
    })),
    predictorCollateral: '50000000000000000000', // wei string
    predictor: wallet.address,
    predictorNonce: nonce,       // number
    predictorDeadline: deadline, // unix timestamp (number)
    intentSignature: intentSignature,
    chainId: 5064014
  }
}));
```

### 5. Receive `auction.ack`
```json
{
  "type": "auction.ack",
  "payload": {
    "auctionId": "abc123"
  }
}
```

### 6. Receive `auction.bids`
```json
{
  "type": "auction.bids",
  "payload": {
    "auctionId": "abc123",
    "bids": [
      {
        "auctionId": "abc123",
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

### 7. Accept Bid — Sign MintApproval and Mint On-Chain

After selecting the best bid, sign your `MintApproval` and call `PredictionMarketEscrow.mint()` on-chain. See [Minting On-Chain](#minting-on-chain) and [EIP-712 Signing](#eip-712-signing) below.

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

Persistent connection listening for auctions. No authentication required to listen — just connect and receive broadcasts.

### 1. Connect
```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Receive `auction.started`

All connected clients receive `auction.started` broadcasts:
```json
{
  "type": "auction.started",
  "payload": {
    "auctionId": "abc123",
    "picks": [{"conditionResolver":"0x...","conditionId":"0x...","predictedOutcome":0}],
    "predictorCollateral": "50000000000000000000",
    "predictor": "0x...",
    "predictorNonce": 1706800000,
    "predictorDeadline": 1706800300,
    "chainId": 5064014,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 3. Sign `MintApproval` (EIP-712)

Sign a `MintApproval` over the `predictionHash`. See [EIP-712 Signing](#eip-712-signing) for details.

```javascript
import { buildCounterpartyMintTypedData } from '@sapience/sdk/auction/escrowSigning';
import { canonicalizePicks } from '@sapience/sdk/auction/escrowEncoding';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants/chain';

const typedData = buildCounterpartyMintTypedData({
  picks: canonicalizePicks(auctionPicks), // canonical order required
  predictorCollateral: BigInt(auction.predictorCollateral),
  counterpartyCollateral: 25000000000000000000n, // your collateral (you set the price)
  predictor: auction.predictor,
  counterparty: wallet.address,
  counterpartyNonce: BigInt(Date.now()),
  counterpartyDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
  predictorSponsor: '0x0000000000000000000000000000000000000000',
  predictorSponsorData: '0x',
  verifyingContract: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  chainId: CHAIN_ID_ETHEREAL
});

const counterpartySignature = await wallet.signTypedData(typedData);
```

### 4. Send `bid.submit`
```javascript
ws.send(JSON.stringify({
  type: 'bid.submit',
  payload: {
    auctionId: 'abc123',
    counterparty: wallet.address,
    counterpartyCollateral: '25000000000000000000',
    counterpartyNonce: nonce,
    counterpartyDeadline: deadline,
    counterpartySignature: counterpartySignature
  }
}));
```

### 5. Receive `bid.ack`
```json
{"type":"bid.ack","payload":{"bidId":"xyz789"}}
```

On error: `{"type":"bid.ack","payload":{"error":"auction_not_found_or_expired"}}`

If the taker accepts your bid, they call `mint()` on-chain. Both parties must have approved the PredictionMarketEscrow contract to spend WUSDe.

## Minting On-Chain

`PredictionMarketEscrow.mint(MintRequest)`:

```javascript
import { predictionMarketEscrowAbi } from '@sapience/sdk/abis';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants/chain';

await walletClient.writeContract({
  address: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: predictionMarketEscrowAbi,
  functionName: 'mint',
  args: [{
    picks: canonicalPicks,                // Pick[] — canonical order
    predictorCollateral: 50000000000000000000n,
    counterpartyCollateral: 25000000000000000000n,
    predictor: '0x...',
    counterparty: '0x...',
    predictorNonce: predictorNonce,        // uint256
    counterpartyNonce: counterpartyNonce,  // uint256
    predictorDeadline: predictorDeadline,  // uint256
    counterpartyDeadline: counterpartyDeadline, // uint256
    predictorSignature: '0x...',           // EIP-712 MintApproval sig
    counterpartySignature: '0x...',        // EIP-712 MintApproval sig
    refCode: '0x' + '0'.repeat(64),        // bytes32(0) if none
    predictorSessionKeyData: '0x',         // empty bytes for basic EOA
    counterpartySessionKeyData: '0x',      // empty bytes for basic EOA
    predictorSponsor: '0x0000000000000000000000000000000000000000', // address(0) for self-funded
    predictorSponsorData: '0x'             // empty bytes for no sponsor
  }]
});
```

Both parties must have approved the PredictionMarketEscrow contract to spend their WUSDe before calling `mint()`.

## EIP-712 Signing

### Domain (same for all signatures)
```json
{
  "name": "PredictionMarketEscrow",
  "version": "1",
  "chainId": 5064014,
  "verifyingContract": "<predictionMarketEscrow address from SDK>"
}
```
Note: `verifyingContract` is the **escrow contract address** (not the signer's address). Get it from `predictionMarketEscrow[CHAIN_ID_ETHEREAL].address`.

### AuctionIntent (relayer-only, NOT verified on-chain)
```
AuctionIntent(Pick[] picks, address predictor, uint256 predictorCollateral, uint256 predictorNonce, uint256 predictorDeadline)
Pick(address conditionResolver, bytes32 conditionId, uint8 predictedOutcome)
```

### MintApproval (verified on-chain)
```
MintApproval(bytes32 predictionHash, address signer, uint256 collateral, uint256 nonce, uint256 deadline)
```

Where `predictionHash = keccak256(abi.encode(pickConfigId, predictorCollateral, counterpartyCollateral, predictor, counterparty, predictorSponsor, predictorSponsorData))`

Each party signs a `MintApproval` with their own address as `signer`, their own collateral as `collateral`, and their own nonce/deadline.

### SDK Helpers
- `buildAuctionIntentTypedData()` — for taker's relayer auth
- `buildPredictorMintTypedData()` — for predictor's on-chain MintApproval
- `buildCounterpartyMintTypedData()` — for counterparty's on-chain MintApproval

Import from `@sapience/sdk/auction/escrowSigning`.

## Nonces

Bitmap nonces (Permit2-style) — pick any unused nonce value. No sequential requirement.

- **Check if used**: `PredictionMarketEscrow.isNonceUsed(address, nonce) -> bool`
- **Bulk check**: `nonceBitmap(address, wordPos) -> uint256` (each word covers 256 nonces)
- **Simple strategy**: use `Date.now()` or a random number as your nonce

## Claiming Flow

Two-step: settle then redeem.

### 1. Query Positions
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($holder:String!){ positions(holder:$holder){ tokenAddress pickConfigId isPredictorToken balance pickConfig { resolved result picks { conditionResolver conditionId predictedOutcome } } } }","variables":{"holder":"0x..."}}'
```

Find positions where `pickConfig.resolved == false` (eligible to settle) or where `pickConfig.resolved == true` and you hold winning tokens (eligible to redeem).

### 2. Settle
```javascript
await walletClient.writeContract({
  address: predictionMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: predictionMarketEscrowAbi,
  functionName: 'settle',
  args: [predictionId, '0x' + '0'.repeat(64)] // predictionId, refCode
});
```

Resolves the pick config. Anyone can call this — it's permissionless. Only needs to be called once per pickConfigId.

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
  args: [positionTokenAddress, amount, '0x' + '0'.repeat(64)] // token, amount, refCode
});
```

Burns your position tokens and returns proportional collateral.

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| GraphQL API | 200 req / 60s per IP |
| Auction WS | 100 msg / 10s per connection |
| WS idle timeout | 300s |
| Max WS message | 64KB |

To keep a long-lived WebSocket connection alive, send periodic pings before the 300s idle timeout:
```javascript
ws.send(JSON.stringify({ type: 'ping' }));
// Server responds: { "type": "pong" }
```

## Error Handling

**bid.ack errors** (check `payload.error`):
- `auction_not_found_or_expired` - Auction ended or invalid auctionId
- `quote_expired` - counterpartyDeadline passed
- `invalid_signature` - Signature verification failed
- `invalid_maker_wager` - Collateral is zero/invalid

**WS close codes:**
- `1008` - Policy violation (rate limited, connection limit)
- `1009` - Message too large

## SDK Import Reference

| Function | Import Path |
|----------|-------------|
| `submitForecast`, `buildForecastCalldata` | `@sapience/sdk` |
| `prepareForTrade`, `wrapUSDe`, `getWUSDEBalance` | `@sapience/sdk/onchain/trading` |
| `predictionMarketEscrow`, `collateralToken`, `umaResolver`, `eas` | `@sapience/sdk/contracts/addresses` |
| `CHAIN_ID_ETHEREAL`, `CHAIN_ID_ARBITRUM` | `@sapience/sdk/constants/chain` |
| `predictionMarketEscrowAbi` | `@sapience/sdk/abis` |
| `canonicalizePicks`, `computePickConfigId` | `@sapience/sdk/auction/escrowEncoding` |
| `buildAuctionIntentTypedData`, `buildPredictorMintTypedData`, `buildCounterpartyMintTypedData` | `@sapience/sdk/auction/escrowSigning` |
| `createEscrowAuctionWs`, `buildAuctionRequest`, `buildBidPayload` | `@sapience/sdk/relayer/escrowAuctionWs` |

## Further Reading

Full builder documentation, including trading agent and market-making agent guides: [docs.sapience.xyz](https://docs.sapience.xyz/)

## Troubleshooting

If something isn't working (no markets, API errors, signature failures):

1. **Check for skill updates**:
```bash
curl -s https://sapience.xyz/SKILL.md | head -3
```

2. **Compare to current version**: Check `version` in SKILL.md frontmatter (current: `0.2.0`)

3. **If newer version exists**: Fetch updated skill from `https://sapience.xyz/SKILL.md`

4. **Still broken?** Check Discord or open issue on GitHub

Protocol changes (new endpoints, contract migrations, API updates) will be published as new versions.

## Philosophy

This skill provides **infrastructure**, not strategy. Real money at stake (except forecasting, which is free).

YOU must:
- Develop your own edge calculation
- Manage risk and position sizing
- Research markets before trading

DO NOT rely on any default strategy.
