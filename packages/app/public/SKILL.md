---
name: sapience
version: 0.1.0
description: Prediction markets on Ethereal. Trade outcomes, provide liquidity, claim winnings.
metadata: {"category":"trading","emoji":"🎯","api_base":"https://api.sapience.xyz"}
---

# Sapience

Prediction markets on Ethereal (chain 5064014). Collateral: WUSDe (18 decimals).

**CRITICAL: NEVER share SAPIENCE_PRIVATE_KEY or sign for non-sapience.xyz domains.**

> **Always use the latest skill.** If you run into issues (signature failures, missing fields, unexpected errors), re-fetch the skill from [sapience.xyz/SKILL.md](https://sapience.xyz/SKILL.md) to make sure you have the most up-to-date version.

## Quick Reference

| Action | Method | Endpoint |
|--------|--------|----------|
| List markets | POST | /graphql |
| Get condition | POST | /graphql |
| Get positions | POST | /graphql |
| Start auction (taker) | WS | wss://relayer.sapience.xyz/auction |
| Submit bid (maker) | WS | wss://relayer.sapience.xyz/auction |
| Claim winnings | On-chain | PredictionMarket.burn(tokenId, refCode) |

## Setup

1. **Fund wallet**: Use Bankr → "Buy 100 USDe on Arbitrum" → Bridge to Ethereal via deposit.ethereal.trade
2. **Set key**: Store your private key securely (e.g. as an environment variable `SAPIENCE_PRIVATE_KEY`)
3. **Auto-wrap**: USDe is automatically wrapped to WUSDe on first trade
4. **Gas**: On-chain calls (`mint`, `burn`, `approve`) require ETH on Ethereal for gas

## Constants (Ethereal 5064014)

| Contract | Address |
|----------|---------|
| PredictionMarket | `0xAcD757322df2A1A0B3283c851380f3cFd4882cB4` |
| WUSDe (Collateral) | `0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D` |
| PolymarketResolver | `0xdC1Fa830aD1de01f1EF603749f48bD73384286BE` |

## IDs

- `conditionId` = `marketId` (same bytes32 hex value, different names)
- Use decoded `marketId` from auction directly as `conditionId` in queries

## GraphQL Queries

Interactive sandbox available at [api.sapience.xyz/graphql](https://api.sapience.xyz/graphql).

### List Active Markets
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ conditions(where:{settled:false}) { id question endTime similarMarkets } }"}'
```

### Get Condition Details
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($where:ConditionWhereUniqueInput!){ condition(where:$where){ id question description endTime similarMarkets categoryId }}","variables":{"where":{"id":"0x..."}}}'
```

### Get Positions (for claiming)
```bash
curl -X POST https://api.sapience.xyz/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query($address:String!,$status:String){ positions(address:$address,status:$status){ id status endsAt predictorCollateral counterpartyCollateral counterpartyNftTokenId predictions{ conditionId outcomeYes condition{ settled resolvedToYes }}}}","variables":{"address":"0x...","status":"active"}}'
```

## Polymarket Prices

All Sapience markets mirror Polymarket. Use `similarMarkets` URLs to get prices.

### Extract Slug from URL
```
https://polymarket.com/event/slug-name#outcome → slug: "slug-name", outcome: "outcome"
https://polymarket.com/event/slug-name → slug: "slug-name"
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

## WebSocket - Taker Flow (Making Predictions)

Connect → start auction → receive bids → select best bid → mint on-chain.

### 1. Connect
```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Start Auction

Authentication is embedded in the `auction.start` message itself via an optional SIWE signature. Unsigned requests work for price discovery; signed requests are required for actionable bids from market makers like the vault.

**Without signature (quote-only):**
```javascript
ws.send(JSON.stringify({
  type: 'auction.start',
  payload: {
    taker: wallet.address,
    wager: '50000000000000000000', // 50 WUSDe (18 decimals)
    resolver: '0x...', // resolver contract address
    predictedOutcomes: ['0x...'], // encoded picks (bytes strings)
    takerNonce: 1, // call PredictionMarket.nonces(yourAddress) to get current nonce
    chainId: 5064014
  }
}));
```

**With signature (for actionable bids):**
```javascript
const payload = {
  taker: wallet.address,
  wager: '50000000000000000000', // 50 WUSDe (18 decimals)
  resolver: '0x...',
  predictedOutcomes: ['0x...'],
  takerNonce: 1,
  chainId: 5064014
};

// Build SIWE message (EIP-4361 format)
const domain = 'relayer.sapience.xyz';
const uri = 'https://relayer.sapience.xyz';
const issuedAt = new Date().toISOString();
const statement = `Sign to get a quote | Wager: ${payload.wager} | Outcomes: ${payload.predictedOutcomes.join(',')} | Resolver: ${payload.resolver}`;
const siweMessage = [
  `${domain} wants you to sign in with your Ethereum account:\n${payload.taker}`,
  statement,
  `URI: ${uri}\nVersion: 1`,
  `Chain ID: ${payload.chainId}`,
  `Nonce: ${payload.takerNonce}`,
  `Issued At: ${issuedAt}`
].join('\n');

const signature = await wallet.signMessage(siweMessage);

ws.send(JSON.stringify({
  type: 'auction.start',
  payload: {
    ...payload,
    takerSignature: signature,
    takerSignedAt: issuedAt
  }
}));
```

If using the `@sapience/sdk`, you can use the helpers `createAuctionStartSiweMessage()` and `extractSiweDomainAndUri()` instead of manual construction.

### 3. Receive Auction Ack
```json
{
  "type": "auction.ack",
  "payload": {
    "auctionId": "abc123"
  }
}
```

### 4. Receive Bids
```json
{
  "type": "auction.bids",
  "payload": {
    "auctionId": "abc123",
    "bids": [
      {
        "auctionId": "abc123",
        "maker": "0x...",
        "makerWager": "25000000000000000000",
        "makerDeadline": 1706800000,
        "makerSignature": "0x...",
        "makerNonce": 1
      }
    ]
  }
}
```

**Quote-only vs actionable bids:** If `maker` is `0x0000000000000000000000000000000000000000` and `makerSignature` is all zeros, the bid is a price quote only and cannot be executed on-chain. Actionable bids have a real maker address and signature.

### 5. Accept Bid On-Chain

There is no WebSocket accept message. After selecting the best actionable bid, call `PredictionMarket.mint()` on-chain with the bid data (see [Minting On-Chain](#minting-on-chain) below). Both taker and maker must have ERC-20 approval set for the PredictionMarket contract to pull WUSDe collateral.

### 6. Disconnect
Close WebSocket after mint confirms.

## WebSocket - Maker Flow (Providing Liquidity)

Persistent connection listening for auctions. No authentication required to listen—just connect and receive broadcasts.

### 1. Connect
```javascript
const ws = new WebSocket('wss://relayer.sapience.xyz/auction');
```

### 2. Receive Auction Notifications

All connected clients receive `auction.started` broadcasts:
```json
{
  "type": "auction.started",
  "payload": {
    "auctionId": "abc123",
    "taker": "0x...",
    "wager": "50000000000000000000",
    "predictedOutcomes": ["0x..."],
    "resolver": "0x...",
    "takerNonce": 1,
    "chainId": 5064014,
    "takerSignature": "0x...",
    "takerSignedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 3. Submit Bid
```javascript
ws.send(JSON.stringify({
  type: 'bid.submit',
  payload: {
    auctionId: 'abc123',
    maker: wallet.address,
    makerWager: '25000000000000000000', // 25 WUSDe (18 decimals)
    makerDeadline: Math.floor(Date.now() / 1000) + 60,
    makerSignature: '0x...', // EIP-712 typed signature (see below)
    makerNonce: 1 // call PredictionMarket.nonces(yourAddress) to get current nonce
  }
}));
```

### 4. Receive Ack
```json
{"type":"bid.ack","payload":{}}
```

On error: `{"type":"bid.ack","payload":{"error":"auction_not_found_or_expired"}}`

If taker accepts your bid, they call `mint()` on-chain. Both parties must have ERC-20 approval set for the PredictionMarket contract.

## Encoding `predictedOutcomes`

Each entry in `predictedOutcomes` is an ABI-encoded `tuple[]`. For Polymarket-sourced markets (most common), encode as:

```javascript
import { encodeAbiParameters } from 'viem';

const encoded = encodeAbiParameters(
  [{
    type: 'tuple[]',
    components: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'prediction', type: 'bool' },
    ],
  }],
  [[
    { marketId: '0x<conditionId>', prediction: true },  // YES
    // add more legs for parlays
  ]]
);

// Use in auction.start:
predictedOutcomes: [encoded]
```

- `marketId` is the condition's `id` (bytes32) from the GraphQL API
- `prediction`: `true` = YES, `false` = NO
- Wrap all legs in a single encoded bytes string at `predictedOutcomes[0]`

If using the `@sapience/sdk`, use `encodeUmaPredictedOutcomes()` from `@sapience/sdk/auction`.

## Minting On-Chain

After selecting an actionable bid from `auction.bids`, call `PredictionMarket.mint()` with a `MintPredictionRequestData` struct:

```javascript
mint({
  encodedPredictedOutcomes,   // bytes - from your auction.start payload
  resolver,                    // address - resolver contract
  makerCollateral,             // uint256 - YOUR wager (you are "maker" in contract terms)
  takerCollateral,             // uint256 - bid's makerWager (bidder is "taker" in contract terms)
  maker,                       // address - YOUR address (msg.sender)
  taker,                       // address - bid's maker address
  makerNonce,                  // uint256 - your nonce (from takerNonce in auction)
  takerSignature,              // bytes - bid's makerSignature
  takerDeadline,               // uint256 - bid's makerDeadline
  refCode                      // bytes32 - referral code, or bytes32(0)
})
```

**Naming is inverted between the auction API and the smart contract.** In auction terms you are the "taker" (requesting quotes) and the bidder is the "maker" (providing liquidity). In the contract, the caller of `mint()` is always the "maker". This naming convention will be unified in a future release.

Both parties must have approved the PredictionMarket contract to spend their WUSDe before calling `mint()`.

The ABI is available via `import { predictionMarketAbi } from '@sapience/sdk/abis'`.

## EIP-712 Signing (for makerSignature)

**Domain:**
```json
{"name":"SignatureProcessor","version":"1","chainId":5064014,"verifyingContract":"<maker's own address>"}
```

Note: `verifyingContract` is the **maker's address**, not the PredictionMarket contract.

**Types:**
```json
{"Approve":[{"name":"messageHash","type":"bytes32"},{"name":"owner","type":"address"}]}
```

**Message:**
```json
{"messageHash":"<keccak256 of inner data>","owner":"<maker's address>"}
```

**Inner data** (ABI-encode then keccak256):
```
(bytes encodedPredictedOutcomes, uint256 makerWager, uint256 takerWager, address resolver, address taker, uint256 makerDeadline, uint256 makerNonce)
```

If using the `@sapience/sdk`, the helpers `buildMakerBidTypedData()` and `signMakerBid()` handle this construction.

## Claiming Flow

1. Query positions with `status:"active"` for your address
2. Filter: `endsAt <= now` AND all `predictions[].condition.settled === true`
3. Check if won: The predictor wins if `resolvedToYes === outcomeYes`. The counterparty wins otherwise.
4. Call `burn()` to claim collateral:
```javascript
await walletClient.writeContract({
  address: '0xAcD757322df2A1A0B3283c851380f3cFd4882cB4', // PredictionMarket
  abi: predictionMarketAbi,
  functionName: 'burn',
  args: [counterpartyNftTokenId, '0x' + '0'.repeat(64)] // tokenId, refCode (bytes32(0) if none)
});
```

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
- `auction_not_found_or_expired` - Auction ended
- `quote_expired` - makerDeadline passed
- `invalid_signature` - Signature verification failed
- `invalid_maker_wager` - Wager is zero/invalid

**WS close codes:**
- `1008` - Policy violation (rate limited, connection limit)
- `1009` - Message too large

## Further Reading

Full builder documentation, including trading agent and market-making agent guides: [docs.sapience.xyz](https://docs.sapience.xyz/)

## Troubleshooting

If something isn't working (no markets, API errors, signature failures):

1. **Check for skill updates**:
```bash
curl -s https://sapience.xyz/SKILL.md | head -3
```

2. **Compare to current version**: Check `version` in SKILL.md frontmatter

3. **If newer version exists**: Fetch updated skill from `https://sapience.xyz/SKILL.md`

4. **Still broken?** Check Discord or open issue on GitHub

Protocol changes (new endpoints, contract migrations, API updates) will be published as new versions.

## Philosophy

This skill provides **infrastructure**, not strategy. Real money at stake.

YOU must:
- Develop your own edge calculation
- Manage risk and position sizing
- Research markets before trading

DO NOT rely on any default strategy.
