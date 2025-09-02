# RFQ WebSocket API Documentation

## Overview

The RFQ (Request for Quote) WebSocket API enables real-time communication between clients, bots, and the system for creating and managing prediction market parlays using the ParlayPool contract. The system supports a mint-based flow where parlays are created immediately when both parties provide valid signatures.

## WebSocket Endpoint

```
ws://localhost:3001/ws/rfq
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

### Client to Server Messages

#### 1. RFQ Request

Creates a new request for quotes from bots.

```typescript
{
  type: 'rfq.request',
  payload: {
    rfqId: string,                    // Unique identifier for this RFQ
    wager: string,                    // Maker's wager amount (wei)
    predictedOutcomes: [              // Array of bytes strings that the resolver validates/understands
      string,                         // Bytes string representing market prediction
      string                          // Additional prediction bytes strings...
    ],
    resolver: string                  // Resolver contract address
  }
}
```

**Response**: `rfq.ack` with `rfqId`

### Bot to Server Messages

#### 1. Bid Submit

Submits a bid/quote for an RFQ. The simplified structure provides only what the maker needs to complete the mint transaction.

```typescript
{
  type: 'bid.submit',
  payload: {
    rfqId: string,                    // RFQ ID to bid on
    taker: string,                    // Taker's EOA address
    expirationTimestamp: number,      // Unix timestamp when quote expires
    takerWager: string,               // Taker's wager contribution (wei)
    takerPermitSignature: string,     // ERC20 permit signature
    takerBidSignature: string         // Taker's signature allowing this specific bid
  }
}
```

**Response**: `bid.ack` with `bidId` or `error`

### Server to Client Messages

#### 1. RFQ Acknowledgment

Confirms receipt of an RFQ request.

```typescript
{
  type: 'rfq.ack',
  payload: {
    rfqId: string
  }
}
```

#### 2. Bid Acknowledgment

Confirms receipt of a bid or reports an error.

```typescript
{
  type: 'bid.ack',
  payload: {
    bidId?: string,                   // Unique bid identifier
    error?: string                    // Error message if bid rejected
  }
}
```

#### 3. RFQ Requested (Broadcast)

Broadcasts new RFQ requests to all connected bots.

```typescript
{
  type: 'rfq.requested',
  payload: RfqRequestPayload          // Same as rfq.request payload
}
```

#### 4. RFQ Bids (Broadcast)

Broadcasts current bids for an RFQ to all clients.

```typescript
{
  type: 'rfq.bids',
  payload: {
    rfqId: string,
    bids: [                           // Array of validated bids
      {
        // ... BidPayload fields
        bidId: string                 // Unique bid identifier
      }
    ]
  }
}
```

## Bid Selection

The UI presents the best available bid that hasn't expired yet. The best bid is determined by the highest taker wager amount among all valid (non-expired) bids.

## Validation Rules

### RFQ Validation

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

### 1. Client Creates RFQ

```javascript
ws.send(
  JSON.stringify({
    type: 'rfq.request',
    payload: {
      rfqId: 'rfq-123',
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

### 2. Bot Responds with Bid

```javascript
ws.send(
  JSON.stringify({
    type: 'bid.submit',
    payload: {
      rfqId: 'rfq-123',
      taker: '0x...',
      expirationTimestamp: Math.floor(Date.now() / 1000) + 60,
      takerWager: '500000000000000000',
      takerPermitSignature: '0x...', // ERC20 permit signature
      takerBidSignature: '0x...', // Signature allowing this bid
    },
  })
);
```

### 3. Client Executes Transaction

After receiving and selecting a bid, the maker (client) constructs the `MintParlayRequestData` struct using:

- The RFQ data (predictedOutcomes, resolver, makerCollateral from wager)
- The bid data (taker, takerWager, takerPermitSignature, takerBidSignature)
- Their own maker signature and refCode

The maker then calls the `mint()` function on the ParlayPool contract. The system will automatically detect the minting through blockchain event listeners.

## Bot Example

The system includes a reference bot implementation (`botExample.ts`) that:

- Connects to the WebSocket endpoint
- Listens for `rfq.requested` messages
- Automatically calculates taker collateral as 50% of maker collateral
- Submits bids with proper mint data structure
- Handles bid acknowledgments and bid updates

## Security Considerations

1. **Rate Limiting**: Prevents spam and DoS attacks
2. **Message Size Limits**: Prevents memory exhaustion
3. **Signature Validation**: ERC20 permit signatures are validated
4. **Collateral Validation**: Ensures reasonable collateral amounts
5. **Expiration Checks**: Prevents execution of expired quotes/RFQs

## Error Handling

All errors are returned in the `bid.ack` message with descriptive error codes. Clients should implement proper error handling and retry logic for transient failures.

## Future Enhancements

- [ ] Full ERC20 permit signature validation
- [ ] Contract interaction simulation
- [ ] Market validation integration
- [ ] Advanced bid ranking algorithms
- [ ] Multi-chain support
- [ ] Order book persistence
