# Auction WebSocket Service

## Overview

The Auction WebSocket API enables real-time communication between predictors and counterparties, facilitated by a relayer, for creating and managing prediction market auctions using the `PredictionMarketEscrow` contract. Predictors create auctions with their picks and collateral, counterparties submit bids, and the relayer facilitates matching by validating payloads and broadcasting auction data. Both parties sign EIP-712 typed data to authorize the on-chain mint.

## Quick Start

```bash
# Development
pnpm dev:auction

# Production
pnpm --filter @sapience/relayer start
```

## Message Types

### Client -> Server

#### 1. `auction.start`

Starts a new auction. The predictor submits their picks, collateral, and EIP-712 signature.

```typescript
{
  type: 'auction.start',
  payload: {
    picks: [                              // Array of condition picks
      {
        conditionResolver: string,        // Resolver contract address (0x...)
        conditionId: string,              // Condition identifier (bytes32 hex)
        predictedOutcome: 0 | 1           // 0 = YES, 1 = NO
      }
    ],
    predictorCollateral: string,          // Predictor's collateral (wei string)
    counterpartyCollateral: string,       // Requested counterparty collateral (wei string)
    predictor: string,                    // Predictor's address (EOA or smart account)
    predictorNonce: number,               // Nonce for deduplication
    predictorDeadline: number,            // Unix timestamp when approval expires
    predictorSignature: string,           // EIP-712 MintApproval signature
    chainId: number,                      // Chain ID (e.g. 5064014 for Ethereal)
    refCode?: string,                     // Optional referral code
    predictorSessionKeyData?: string      // Optional ZeroDev session key data
  }
}
```

#### 2. `auction.subscribe`

Subscribe to bid updates for an auction. The predictor is auto-subscribed on `auction.start`.

```typescript
{
  type: 'auction.subscribe',
  payload: { auctionId: string }
}
```

#### 3. `auction.unsubscribe`

Unsubscribe from auction updates.

```typescript
{
  type: 'auction.unsubscribe',
  payload: { auctionId: string }
}
```

#### 4. `bid.submit`

Submit a bid as counterparty for an open auction.

```typescript
{
  type: 'bid.submit',
  payload: {
    auctionId: string,                    // Auction to bid on
    counterparty: string,                 // Counterparty's address
    counterpartyCollateral: string,       // Counterparty's collateral (wei string)
    counterpartyNonce: number,            // Nonce for deduplication
    counterpartyDeadline: number,         // Unix timestamp when approval expires
    counterpartySignature: string,        // EIP-712 MintApproval signature
    counterpartySessionKeyData?: string   // Optional ZeroDev session key data
  }
}
```

#### 5. `ping`

Keep-alive message. Server responds with `pong`.

```typescript
{
  type: 'ping';
}
```

### Server -> Client

| Type              | Description                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `auction.ack`     | Confirms auction start/subscribe/unsubscribe. Contains `{ auctionId, subscribed?, unsubscribed?, error? }`     |
| `auction.started` | Broadcast to all clients when a new auction opens. Contains full `AuctionDetails`.                             |
| `auction.bids`    | Sent to auction subscribers when bids update. Contains `{ auctionId, bids: ValidatedBid[] }`                   |
| `auction.filled`  | Sent when prediction is minted on-chain. Contains `{ auctionId, predictionId, pickConfigId, transactionHash }` |
| `auction.expired` | Sent when auction deadline passes. Contains `{ auctionId, reason }`                                            |
| `bid.ack`         | Confirms bid receipt or reports error. Contains `{ bidId?, error? }`                                           |
| `pong`            | Response to `ping`                                                                                             |
| `error`           | Server error. Contains `{ message, code? }`                                                                    |

## Vault Quote Protocol

The vault quote protocol is multiplexed on the same `/auction` endpoint.

| Client Message            | Description                                                                  |
| ------------------------- | ---------------------------------------------------------------------------- |
| `vault_quote.subscribe`   | Subscribe to vault share price updates. Payload: `{ chainId, vaultAddress }` |
| `vault_quote.unsubscribe` | Unsubscribe from vault updates. Payload: `{ chainId, vaultAddress }`         |
| `vault_quote.publish`     | Publish a signed vault quote (vault manager only).                           |
| `vault_quote.observe`     | Observe all vault quote activity (debug).                                    |

Server responds with `vault_quote.ack` and `vault_quote.update` messages.

## Example Flow

### 1. Predictor Creates Auction

```typescript
import {
  createEscrowAuctionWs,
  buildAuctionRequest,
} from '@sapience/sdk/relayer/escrowAuctionWs';
import { pythConditionResolver } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const client = createEscrowAuctionWs('wss://relayer.sapience.xyz/auction', {
  onAuctionAck: ({ auctionId }) => console.log('Auction created:', auctionId),
  onAuctionBids: ({ auctionId, bids }) => console.log('Bids:', bids),
  onAuctionFilled: ({ transactionHash }) =>
    console.log('Filled:', transactionHash),
});

client.startAuction({
  picks: [
    {
      conditionResolver: pythConditionResolver[CHAIN_ID_ETHEREAL].address,
      conditionId: '0x...',
      predictedOutcome: 0, // YES
    },
  ],
  predictorCollateral: '1000000000000000000', // 1 WUSDe
  counterpartyCollateral: '1000000000000000000',
  predictor: '0xYourAddress',
  predictorNonce: 1,
  predictorDeadline: Math.floor(Date.now() / 1000) + 300,
  predictorSignature: '0x...', // EIP-712 signature
  chainId: CHAIN_ID_ETHEREAL,
});
```

### 2. Counterparty Submits Bid

```typescript
client.submitBid({
  auctionId: 'auction-uuid',
  counterparty: '0xCounterpartyAddress',
  counterpartyCollateral: '1000000000000000000',
  counterpartyNonce: 1,
  counterpartyDeadline: Math.floor(Date.now() / 1000) + 60,
  counterpartySignature: '0x...', // EIP-712 signature
});
```

### 3. On-Chain Execution

After the predictor selects a bid, both signatures are submitted to `PredictionMarketEscrow.mint()` on-chain. The contract verifies both EIP-712 signatures, transfers collateral from both parties into escrow, and mints position tokens.

## Connection Management

| Limit            | Value                                 |
| ---------------- | ------------------------------------- |
| Rate limit       | 100 messages per 10s window           |
| Max message size | 64 KB                                 |
| Idle timeout     | Configurable via `WS_IDLE_TIMEOUT_MS` |
| Max connections  | Configurable via `WS_MAX_CONNECTIONS` |

Exceeding rate limits or message size closes the connection with code `1008` or `1009`.

## Validation Rules

### Auction Validation

- `picks` must be a non-empty array with valid `conditionResolver` (address), `conditionId` (bytes32), and `predictedOutcome` (0 or 1)
- `predictorCollateral` must be a positive wei string
- `predictor` must be a valid address
- `predictorDeadline` must be in the future
- `chainId` must be a positive integer

### Bid Validation

- `counterparty` must be a valid address
- `counterpartyCollateral` must be a positive wei string
- `counterpartyDeadline` must be in the future
- `counterpartySignature` must be a valid hex string

## Environment Variables

| Variable                  | Default       | Description                     |
| ------------------------- | ------------- | ------------------------------- |
| `PORT`                    | `3002`        | Server port                     |
| `ENABLE_AUCTION_WS`       | `true`        | Enable auction WebSocket        |
| `WS_MAX_CONNECTIONS`      | -             | Max concurrent connections      |
| `WS_IDLE_TIMEOUT_MS`      | -             | Idle connection timeout         |
| `WS_ALLOWED_ORIGINS`      | -             | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS`    | `10000`       | Rate limit window               |
| `RATE_LIMIT_MAX_MESSAGES` | `100`         | Max messages per window         |
| `CHAIN_5064014_RPC_URL`   | -             | Custom RPC for Ethereal mainnet |
| `CHAIN_13374202_RPC_URL`  | -             | Custom RPC for Ethereal testnet |
| `NODE_ENV`                | `development` | Environment                     |
