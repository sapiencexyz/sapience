# Auction WebSocket API Documentation

## Overview

The Auction WebSocket API enables real-time communication between makers and takers, facilitated by a relayer, for creating and managing prediction market auctions using the `PredictionMarket.sol` contract. Makers create auctions with their wagers and predictions, takers submit competitive bids, and the relayer facilitates the matching process by validating signatures and broadcasting auction data. The system supports a mint-based flow where positions (represented as NFTs) are created immediately when both parties provide valid signatures.

## Message Types

### 1. auction.start

Starts a new auction to receive bids from takers.

```typescript
{
  type: 'auction.start',
  payload: {
    maker: string                     // Maker's EOA address
    wager: string,                    // Maker's wager amount (in collateral native units, likely 18 decimals places)
    resolver: string,                 // Resolver contract address
    predictedOutcomes: [              // Array of bytes strings that the resolver validates/understands
      string,                         // Bytes string representing market prediction
      string                          // Additional prediction bytes strings...
    ],
  }
}
```

### 2. Response (auction.ack)

Confirms receipt of an Auction start and automatically subscribes the maker to a channel for bids for that auctionId.

```typescript
{
  type: 'auction.ack',
  payload: {
    auctionId: string
  }
}
```

### 3. auction.started (Broadcast)

Broadcasts new Auction starts to all connected takers.

```typescript
{
  type: 'auction.started',
  payload: {
    auctionId: string,                // Server-generated unique identifier for this Auction
    maker: string,                    // Maker's EOA address
    wager: string,                    // Maker's wager amount (wei)
    predictedOutcomes: [              // Array of bytes strings that the resolver validates/understands
      string,                         // Bytes string representing market prediction
      string                          // Additional prediction bytes strings...
    ],
    resolver: string                  // Resolver contract address
  }
}
```

### 4. bid.submit

Submits a bid/quote for an Auction. The payload MUST explicitly include the taker address, taker wager, and a quote expiration. These values are NOT derivable from a signature and must be provided and then verified against the signed payload.

```typescript
{
  type: 'bid.submit',
  payload: {
    auctionId: string,                // Auction ID to bid on
    taker: string,                    // Taker's EOA address (0x...)
    takerWager: string,               // Taker's wager contribution (wei)
    takerDeadline: number,            // Unix timestamp when quote expires
    takerSignature: string            // Off-chain signature over the typed payload to authorize this bid
  }
}
```

### 5. Response (bid.ack)

Confirms receipt of a bid or reports an error.

```typescript
{
  type: 'bid.ack',
  payload: {
    error?: string                    // Error message if bid rejected
  }
}
```

### 6. auction.bids (Broadcast)

Broadcasts current bids for an Auction to subscribed makers only. Makers are automatically subscribed to an auction channel when they send an `auction.start` for that specific auction ID.

```typescript
{
  type: 'auction.bids',
  payload: {
    bids: [                           // Array of validated bids
      {
        auctionId: string,            // Auction ID this bid is for
        takerSignature: string,       // Taker's off-chain signature authorizing the bid
        taker: string,                // Taker's EOA address
        takerWager: string,           // Taker's wager contribution (collateral units, typically represented with 18 decimals)
        takerDeadline: number         // Unix timestamp when quote expires
      }
    ]
  }
}
```

## Connection Management

### Rate Limiting

- **Window**: 10 seconds
- **Max Messages**: 100 messages per window
- **Exceeded**: Connection closed with code `1008` and reason `rate_limited`

### Message Size Limit

- **Max Size**: 64KB per message
- **Exceeded**: Connection closed with code `1009` and reason `message_too_large`

## Bid Selection

The UI presents the best available bid that hasn't expired yet. The best bid is determined by the highest taker wager amount among all valid (non-expired) bids.

## Validation Rules

### Auction Validation

- Wager must be positive
- At least one predicted outcome required (as non-empty bytes strings)
- Resolver address must be provided
- Maker address must be provided and a valid `0x` address

### Bid Validation

- Quote must not be expired
- Taker wager must be positive and ≤ maker wager
- Off-chain bid signature must be provided and be a valid hex string

### Token Approvals

Both parties must perform standard ERC-20 approvals in their own wallets:

- Maker must approve the contract to spend the maker collateral prior to minting
- Taker must approve the contract to spend the taker collateral prior to filling

### Common Error Codes

- `invalid_payload`: Missing or invalid message structure
- `quote_expired`: Quote has expired
- `invalid_taker_wager`: Taker wager is invalid
- `taker_wager_too_high`: Taker wager exceeds maker wager
- `invalid_taker_bid_signature_format`: Taker bid signature format is invalid

## Example Flow

### 1. Maker Creates Auction

```javascript
ws.send(
  JSON.stringify({
    type: 'auction.start',
    payload: {
      wager: '1000000000000000000', // 1 ETH
      predictedOutcomes: [
        '0x...', // Bytes string representing market prediction
        '0x...', // Additional prediction bytes strings...
      ],
      resolver: '0x...',
      maker: '0xYourMakerAddressHere',
    },
  })
);
```

### 2. Taker Responds with Bid

```javascript
ws.send(
  JSON.stringify({
    type: 'bid.submit',
    payload: {
      auctionId: 'auction-123',
      taker: '0xTakerAddress',
      takerWager: '500000000000000000', // 0.5 ETH
      takerDeadline: Math.floor(Date.now() / 1000) + 60,
      takerSignature: '0x...', // Signature over the typed payload
    },
  })
);
```

### 3. Maker Executes Transaction

After receiving and selecting a bid, the maker constructs the `MintParlayRequestData` struct using:

- The Auction data (predictedOutcomes, resolver, makerCollateral from wager)
- The bid data (taker, takerWager, takerSignature)
- Their own maker signature and refCode

The maker then calls the `mint()` function on the ParlayPool contract. The system will automatically detect the minting through blockchain event listeners.

## Taker Example

The system includes a reference taker implementation (`botExample.ts`) that:

- Connects to the WebSocket endpoint
- Listens for `auction.started` messages
- Automatically calculates taker collateral as 50% of maker collateral
- Submits bids with proper mint data structure
- Handles bid acknowledgments and bid updates

## Security Considerations

1. **Rate Limiting**: Prevents spam and DoS attacks
2. **Message Size Limits**: Prevents memory exhaustion
3. **Approvals**: Standard ERC-20 approvals must be completed by both maker and taker
4. **Collateral Validation**: Ensures reasonable collateral amounts
5. **Expiration Checks**: Prevents execution of expired quotes/Auctions

## Error Handling

All errors are returned in the `bid.ack` message with descriptive error codes. Makers and takers should implement proper error handling and retry logic for transient failures.
