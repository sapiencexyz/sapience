# Auction WebSocket API Documentation

## Overview

The Auction WebSocket API enables real-time communication between clients, bots, and the system for creating and managing prediction market auctions using the PredictionMarket contract. The system supports a mint-based flow where positions are created immediately when both parties provide valid signatures.

## WebSocket Endpoint

```
ws://localhost:3001/ws/auction
```

## Connection Management

### Rate Limiting

- **Window**: 10 seconds
- **Max Messages**: 100 messages per window
- **Exceeded**: Connection closed with code `1008` and reason `rate_limited`

### Message Size Limit

- **Max Size**: 64KB per message
- **Exceeded**: Connection closed with code `1009` and reason `message_too_large`

## Message Types

### Maker to Relayer Messages

#### 1. Auction Start

Starts a new auction to receive bids from takers.

```typescript
{
  type: 'auction.start',
  payload: {
    wager: string,                    // Maker's wager amount (wei)
    resolver: string,                 // Resolver contract address
    predictedOutcomes: [              // Array of bytes strings that the resolver validates/understands
      string,                         // Bytes string representing market prediction
      string                          // Additional prediction bytes strings...
    ]
  }
}
```

**Response**: `auction.ack` with server-generated `auctionId`

### Taker to Relayer Messages

#### 1. Bid Submit

Submits a bid/quote for an Auction. The simplified structure provides only what the maker needs to complete the mint transaction.

```typescript
{
  type: 'bid.submit',
  payload: {
    auctionId: string,                // Auction ID to bid on
    takerPermitSignature: string,     // ERC20 permit signature
    takerBidSignature: string         // Taker's signature allowing this specific bid (contains taker address and wager)
  }
}
```

**Response**: `bid.ack` with success or `error`

### Relayer to Maker/Taker Messages

#### 1. Auction Acknowledgment

Confirms receipt of an Auction start.

```typescript
{
  type: 'auction.ack',
  payload: {
    auctionId: string
  }
}
```

#### 2. Bid Acknowledgment

Confirms receipt of a bid or reports an error.

```typescript
{
  type: 'bid.ack',
  payload: {
    error?: string                    // Error message if bid rejected
  }
}
```

#### 3. Auction Started (Broadcast)

Broadcasts new Auction starts to all connected takers.

```typescript
{
  type: 'auction.started',
  payload: {
    auctionId: string,                // Server-generated unique identifier for this Auction
    wager: string,                    // Maker's wager amount (wei)
    predictedOutcomes: [              // Array of bytes strings that the resolver validates/understands
      string,                         // Bytes string representing market prediction
      string                          // Additional prediction bytes strings...
    ],
    resolver: string                  // Resolver contract address
  }
}
```

#### 4. Auction Bids (Broadcast)

Broadcasts current bids for an Auction to subscribed makers only. Makers are automatically subscribed to an auction channel when they send an `auction.start` for that specific auction ID.

```typescript
{
  type: 'auction.bids',
  payload: {
    bids: [                           // Array of validated bids
      {
        auctionId: string,            // Auction ID this bid is for
        takerPermitSignature: string, // ERC20 permit signature
        takerBidSignature: string,    // Taker's signature allowing this specific bid
        taker: string,                // Taker's EOA address - derived from takerBidSignature by relayer
        takerWager: string,           // Taker's wager contribution (wei) - derived from takerBidSignature by relayer
        expirationTimestamp: number   // Unix timestamp when quote expires - derived from takerBidSignature by relayer
      }
    ]
  }
}
```

## Bid Selection

The UI presents the best available bid that hasn't expired yet. The best bid is determined by the highest taker wager amount among all valid (non-expired) bids.

## Validation Rules

### Auction Validation

- Wager must be positive
- At least one predicted outcome required (as non-empty bytes strings)
- Resolver address must be provided

### Bid Validation

- Quote must not be expired
- Taker wager must be positive and ≤ maker wager
- Mint data must be complete and consistent:
  - Taker address must be provided
  - Taker wager must be provided
  - Both taker signatures (ERC20 permit and bid) must be provided
  - All signatures must be valid hex strings

### Common Error Codes

- `invalid_payload`: Missing or invalid message structure
- `quote_expired`: Quote has expired
- `invalid_taker_wager`: Taker wager is invalid
- `taker_wager_too_high`: Taker wager exceeds maker wager
- `incomplete_mint_data`: Mint data incomplete
- `invalid_taker_permit_signature_format`: Taker permit signature format is invalid
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
      takerPermitSignature: '0x...', // ERC20 permit signature
      takerBidSignature: '0x...', // Signature allowing this bid (contains taker address and wager)
    },
  })
);
```

### 3. Maker Executes Transaction

After receiving and selecting a bid, the maker constructs the `MintParlayRequestData` struct using:

- The Auction data (predictedOutcomes, resolver, makerCollateral from wager)
- The bid data (taker, takerWager, takerPermitSignature, takerBidSignature)
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
3. **Signature Validation**: ERC20 permit signatures are validated
4. **Collateral Validation**: Ensures reasonable collateral amounts
5. **Expiration Checks**: Prevents execution of expired quotes/Auctions

## Error Handling

All errors are returned in the `bid.ack` message with descriptive error codes. Makers and takers should implement proper error handling and retry logic for transient failures.

## Future Enhancements

- [ ] Full ERC20 permit signature validation
- [ ] Contract interaction simulation
- [ ] Market validation integration
- [ ] Advanced bid ranking algorithms
- [ ] Multi-chain support
- [ ] Order book persistence
