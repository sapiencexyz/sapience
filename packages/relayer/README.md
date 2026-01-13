# Auction WebSocket Service

## Overview

The Auction WebSocket API enables real-time communication between takers and makers, facilitated by a relayer, for creating and managing prediction market auctions using the `PredictionMarket.sol` contract. Takers create auctions with their wagers and predictions, makers submit competitive bids, and the relayer facilitates the matching process by validating signatures and broadcasting auction data. The system supports a mint-based flow where positions (represented as NFTs) are created immediately when both parties provide valid signatures.

## Quick Start

```bash
# Development
pnpm dev:auction

# Production
pnpm --filter @sapience/relayer start
```

## API Documentation

## Overview

The Auction WebSocket API enables real-time communication between takers and makers, facilitated by a relayer, for creating and managing prediction market auctions using the `PredictionMarket.sol` contract. Takers create auctions with their wagers and predictions, makers submit competitive bids, and the relayer facilitates the matching process by validating signatures and broadcasting auction data. The system supports a mint-based flow where positions (represented as NFTs) are created immediately when both parties provide valid signatures.

## Message Types

### 1. auction.start

Starts a new auction to receive bids from makers.

```typescript
{
  type: 'auction.start',
  payload: {
    taker: string,                    // Taker's EOA address (starts the auction)
    wager: string,                    // Taker's wager amount (wei)
    resolver: string,                  // Contract address for market validation (0x...)
    predictedOutcomes: string[],      // Array of bytes strings that the resolver validates/understands
    takerNonce: number,               // Nonce for taker-side binding/deduplication
    chainId: number,                  // Chain ID where the market executes
    takerSignature?: string,          // Optional: EIP-191 signature of the taker (SIWE format)
    takerSignedAt?: string            // Optional: ISO timestamp when signature was created (required if takerSignature is provided)
  }
}
```

**Note:** `takerSignature` and `takerSignedAt` are optional fields. 
- **Unsigned requests**: Used for price discovery/quoting only. Market makers may respond with quote-only bids (where `maker` is `0x0000...` and `makerSignature` is `0x0000...`).
- **Signed requests**: Required by some market makers (like the vault) to respond with actionable, signed bids that can be executed on-chain. When provided, the relayer verifies the signature to ensure the requester authorized the auction request.

### 2. Response (auction.ack)

Confirms receipt of an Auction start and automatically subscribes the taker to a channel for bids for that auctionId.

```typescript
{
  type: 'auction.ack',
  payload: {
    auctionId: string
  }
}
```

### 3. auction.started (Broadcast)

Broadcasts new Auction starts to all connected makers.

```typescript
{
  type: 'auction.started',
  payload: {
    auctionId: string,                // Server-generated unique identifier for this Auction
    taker: string,                    // Taker's EOA address
    wager: string,                    // Taker's wager amount (wei)
    predictedOutcomes: string[],      // Array of bytes strings that the resolver validates/understands
    resolver: string,                  // Contract address for market validation (0x...)
    takerNonce: number,
    chainId: number,
  }
}
```

### 4. bid.submit

Submits a bid/quote for an Auction. The payload MUST explicitly include the maker address, maker wager, and a quote expiration. These values are NOT derivable from a signature and must be provided and then verified against the signed payload.

```typescript
{
  type: 'bid.submit',
  payload: {
    auctionId: string,                // Auction ID to bid on
    maker: string,                    // Maker's EOA address (bidding party)
    makerWager: string,               // Maker's wager contribution (wei)
    makerDeadline: number,            // Unix timestamp when quote expires
    makerSignature: string,           // Off-chain signature over the typed payload to authorize this bid
    makerNonce: number                // Maker's nonce
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

Broadcasts current bids for an Auction to subscribed takers only. Takers are automatically subscribed to an auction channel when they send an `auction.start` for that specific auction ID.

```typescript
{
  type: 'auction.bids',
  payload: {
    auctionId: string,
    bids: [                           // Array of validated bids
      {
        auctionId: string,            // Auction ID this bid is for
        makerSignature: string,       // Maker's off-chain signature authorizing the bid
        maker: string,                // Maker's EOA address
        makerWager: string,           // Maker's wager contribution (collateral units, typically represented with 18 decimals)
        makerDeadline: number         // Unix timestamp when quote expires
      }
    ]
  }
}
```

**Quote-only vs Actionable Bids:**
- **Quote-only bids**: When `maker` is `0x0000000000000000000000000000000000000000` and `makerSignature` is `0x00000000...`, this indicates a price quote only, not an actionable bid that can be executed on-chain. These are typically returned in response to unsigned auction requests.
- **Actionable bids**: When `maker` is a valid address and `makerSignature` is a real signature, the bid can be accepted and executed on-chain. These are returned in response to signed auction requests (required by some market makers like the vault).

## Connection Management

### Rate Limiting

- **Window**: 10 seconds
- **Max Messages**: 100 messages per window
- **Exceeded**: Connection closed with code `1008` and reason `rate_limited`

### Message Size Limit

- **Max Size**: 64KB per message
- **Exceeded**: Connection closed with code `1009` and reason `message_too_large`

## Bid Selection

The UI presents the best available bid that hasn't expired yet. The best bid is determined by the highest maker wager amount among all valid (non-expired) bids.

## Validation Rules

### Auction Validation

- Wager must be positive
- At least one predicted outcome required (as non-empty bytes strings)
- Resolver address must be provided
- Taker address must be provided and a valid `0x` address

### Bid Validation

- Quote must not be expired
- Maker wager must be positive
- Off-chain bid signature must be provided and be a valid hex string

### Token Approvals

Both parties must perform standard ERC-20 approvals in their own wallets:

- Maker must approve the contract to spend the maker collateral prior to minting
- Taker must approve the contract to spend the taker collateral prior to filling

### Common Error Codes

- `invalid_payload`: Missing or invalid message structure
- `quote_expired`: Quote has expired
- `invalid_maker_wager`: Maker wager is invalid
- `invalid_maker_bid_signature_format`: Maker bid signature format is invalid

## Example Flow

### 1. Taker Creates Auction

**Basic example (without signature):**

```javascript
ws.send(
  JSON.stringify({
    type: 'auction.start',
    payload: {
      taker: '0xYourTakerAddressHere',
      wager: '1000000000000000000', // 1 ETH
      predictedOutcomes: [
        '0x...', // Bytes string representing market prediction
        '0x...', // Additional prediction bytes strings...
      ],
      resolver: '0x...',
      takerNonce: 1,
      chainId: 42161,
    },
  })
);
```

**With signature (required by some market makers like the vault to respond with actionable bids):**

```javascript
import { createAuctionStartSiweMessage, extractSiweDomainAndUri } from '@sapience/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0xYourPrivateKey...');
const payload = {
  taker: account.address,
  wager: '1000000000000000000',
  predictedOutcomes: ['0x...', '0x...'],
  resolver: '0x...',
  takerNonce: 1,
  chainId: 42161,
};

// Generate SIWE signature
const { domain, uri } = extractSiweDomainAndUri('wss://relayer.sapience.xyz/auction');
const issuedAt = new Date().toISOString();
const message = createAuctionStartSiweMessage(payload, domain, uri, issuedAt);
const signature = await account.signMessage({ message });

ws.send(
  JSON.stringify({
    type: 'auction.start',
    payload: {
      ...payload,
      takerSignature: signature,
      takerSignedAt: issuedAt,
    },
  })
);
```

### 2. Maker Responds with Bid

```javascript
ws.send(
  JSON.stringify({
    type: 'bid.submit',
    payload: {
      auctionId: 'auction-123',
      maker: '0xMakerAddress',
      makerWager: '500000000000000000', // 0.5 ETH
      makerDeadline: Math.floor(Date.now() / 1000) + 60,
      makerSignature: '0x...', // Signature over the typed payload
      makerNonce: 1,
    },
  })
);
```

### 3. Taker Executes Transaction

After receiving and selecting a bid, the taker constructs the `MintParlayRequestData` struct using:

- The Auction data (predictedOutcomes, resolver, takerCollateral from wager)
- The bid data (maker, makerWager, makerSignature)
- Their own taker signature and refCode

The taker then calls the `mint()` function on the ParlayPool contract. The system will automatically detect the minting through blockchain event listeners.

## Maker Example

The system includes a reference maker implementation (`botExample.ts`) that:

- Connects to the WebSocket endpoint
- Listens for `auction.started` messages
- Automatically calculates maker collateral as 50% of taker collateral
- Submits bids with proper mint data structure
- Handles bid acknowledgments and bid updates

## Security Considerations

1. **Rate Limiting**: Prevents spam and DoS attacks
2. **Message Size Limits**: Prevents memory exhaustion
3. **Approvals**: Standard ERC-20 approvals must be completed by both maker and taker
4. **Collateral Validation**: Ensures reasonable collateral amounts
5. **Expiration Checks**: Prevents execution of expired quotes/Auctions

## Error Handling

All errors are returned in the `bid.ack` message with descriptive error codes. Takers and makers should implement proper error handling and retry logic for transient failures.

## Running the Service

```bash
# Development
pnpm --filter @sapience/relayer run dev

# Production
pnpm --filter @sapience/relayer run start
```

## Environment Variables

- `PORT`: Server port (default: 3002)
- `ENABLE_AUCTION_WS`: Enable auction WebSocket (default: true)
- `NODE_ENV`: Environment (development/production/test)
- `INFURA_API_KEY`: Optional Infura API key for blockchain RPC
- `RPC_URL`: Optional custom RPC URL for specific chains

