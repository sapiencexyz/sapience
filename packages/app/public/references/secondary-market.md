# Secondary Market Trading

Trade existing position tokens before settlement. Sellers list tokens via auction, buyers compete to fill. Uses `SecondaryMarketEscrow` for atomic OTC swaps.

WebSocket endpoint: `wss://relayer.sapience.xyz/auction` (same as primary market)

**Prerequisites**: Get your position token addresses from the `positions` GraphQL query (`tokenAddress` field). Seller must approve `SecondaryMarketEscrow` for the position token. Buyer must approve it for WUSDe (collateral).

## Two-Phase Signing

Like the primary market, secondary uses two-phase signing:
1. **Intent signature** — seller signs with `buyer=address(0)` for relayer authentication (buyer unknown at auction time)
2. **On-chain signature** — seller re-signs with the actual buyer address + agreed price before calling `executeTrade()`

## Seller Flow

### 1. Sign Intent and Start Auction

Sign a TradeApproval with `buyer=address(0)` (relayer auth only, NOT valid on-chain):

```javascript
import { buildSellerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import { secondaryMarketEscrow, collateralToken } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const intentTypedData = buildSellerTradeApproval({
  token: '0x<positionTokenAddress>',      // from positions query
  collateral: collateralToken[CHAIN_ID_ETHEREAL].address,
  seller: wallet.address,
  buyer: '0x0000000000000000000000000000000000000000', // unknown at auction time
  tokenAmount: 50000000000000000000n,
  price: 25000000000000000000n,            // minimum acceptable WUSDe
  sellerNonce: BigInt(Date.now()),
  sellerDeadline: BigInt(Math.floor(Date.now() / 1000) + 300),
  verifyingContract: secondaryMarketEscrow[CHAIN_ID_ETHEREAL].address,
  chainId: CHAIN_ID_ETHEREAL,
});

const intentSignature = await wallet.signTypedData(intentTypedData);

ws.send(JSON.stringify({
  type: 'secondary.auction.start',
  payload: {
    token: '0x<positionTokenAddress>',
    collateral: collateralToken[CHAIN_ID_ETHEREAL].address,
    tokenAmount: '50000000000000000000',
    minPrice: '25000000000000000000',
    seller: wallet.address,
    sellerNonce: nonce,
    sellerDeadline: deadline,
    sellerSignature: intentSignature,
    chainId: 5064014,
  }
}));
```

### 2. Receive `secondary.auction.ack`
```json
{"type":"secondary.auction.ack","payload":{"auctionId":"sec123"}}
```

### 3. Receive `secondary.auction.bids`
```json
{
  "type": "secondary.auction.bids",
  "payload": {
    "auctionId": "sec123",
    "bids": [{
      "auctionId": "sec123",
      "buyer": "0x...",
      "price": "30000000000000000000",
      "buyerNonce": 1706800000,
      "buyerDeadline": 1706800060,
      "buyerSignature": "0x...",
      "receivedAt": "2025-01-01T00:00:00.000Z"
    }]
  }
}
```

### 4. Re-sign and Execute On-Chain

Select best bid, sign a new TradeApproval with the **actual buyer and price**, then call `executeTrade()`:

```javascript
import { secondaryMarketEscrowAbi } from '@sapience/sdk/abis';
import { secondaryMarketEscrow, collateralToken } from '@sapience/sdk/contracts/addresses';
import { buildSellerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const bestBid = bids[0];
const sellerNonce = BigInt(Date.now());
const sellerDeadline = BigInt(Math.floor(Date.now() / 1000) + 60);

// Re-sign with ACTUAL buyer address and agreed price
const onChainTypedData = buildSellerTradeApproval({
  token: '0x<positionTokenAddress>',
  collateral: collateralToken[CHAIN_ID_ETHEREAL].address,
  seller: wallet.address,
  buyer: bestBid.buyer,
  tokenAmount: 50000000000000000000n,
  price: BigInt(bestBid.price),
  sellerNonce,
  sellerDeadline,
  verifyingContract: secondaryMarketEscrow[CHAIN_ID_ETHEREAL].address,
  chainId: CHAIN_ID_ETHEREAL,
});

const sellerSignature = await wallet.signTypedData(onChainTypedData);

await walletClient.writeContract({
  address: secondaryMarketEscrow[CHAIN_ID_ETHEREAL].address,
  abi: secondaryMarketEscrowAbi,
  functionName: 'executeTrade',
  args: [{
    token: '0x<positionTokenAddress>',
    collateral: collateralToken[CHAIN_ID_ETHEREAL].address,
    seller: wallet.address,
    buyer: bestBid.buyer,
    tokenAmount: 50000000000000000000n,
    price: BigInt(bestBid.price),
    sellerNonce,
    buyerNonce: BigInt(bestBid.buyerNonce),
    sellerDeadline,
    buyerDeadline: BigInt(bestBid.buyerDeadline),
    sellerSignature,
    buyerSignature: bestBid.buyerSignature,
    refCode: '0x' + '0'.repeat(64),
    sellerSessionKeyData: '0x',
    buyerSessionKeyData: '0x',
  }]
});
```

### 5. Receive `secondary.auction.filled`
```json
{
  "type": "secondary.auction.filled",
  "payload": {
    "auctionId": "sec123",
    "tradeHash": "0x...",
    "transactionHash": "0x..."
  }
}
```

## Buyer Flow

### 1. Listen for `secondary.auction.started`
```json
{
  "type": "secondary.auction.started",
  "payload": {
    "auctionId": "sec123",
    "token": "0x...",
    "collateral": "0x...",
    "tokenAmount": "50000000000000000000",
    "minPrice": "25000000000000000000",
    "seller": "0x...",
    "sellerDeadline": 1706800300,
    "chainId": 5064014,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 2. Sign and Submit Bid

```javascript
import { buildBuyerTradeApproval } from '@sapience/sdk/auction/secondarySigning';
import { secondaryMarketEscrow } from '@sapience/sdk/contracts/addresses';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';

const typedData = buildBuyerTradeApproval({
  token: auction.token,
  collateral: auction.collateral,
  seller: auction.seller,
  buyer: wallet.address,
  tokenAmount: BigInt(auction.tokenAmount),
  price: 30000000000000000000n,            // must be >= minPrice
  buyerNonce: BigInt(Date.now()),
  buyerDeadline: BigInt(Math.floor(Date.now() / 1000) + 60),
  verifyingContract: secondaryMarketEscrow[CHAIN_ID_ETHEREAL].address,
  chainId: CHAIN_ID_ETHEREAL,
});

const buyerSignature = await wallet.signTypedData(typedData);

ws.send(JSON.stringify({
  type: 'secondary.bid.submit',
  payload: {
    auctionId: auction.auctionId,
    buyer: wallet.address,
    price: '30000000000000000000',
    buyerNonce: nonce,
    buyerDeadline: deadline,
    buyerSignature: buyerSignature,
  }
}));
```

### 3. Receive `secondary.bid.ack`
```json
{"type":"secondary.bid.ack","payload":{"bidId":"bid456"}}
```

If the seller accepts, they re-sign and call `executeTrade()` on-chain. The transaction is permissionless — anyone can submit it.

## EIP-712 Domain

```json
{
  "name": "SecondaryMarketEscrow",
  "version": "1",
  "chainId": 5064014,
  "verifyingContract": "<secondaryMarketEscrow address from SDK>"
}
```

**TradeApproval type:**
```
TradeApproval(bytes32 tradeHash, address signer, uint256 nonce, uint256 deadline)
```

Where `tradeHash = keccak256(abi.encode(token, collateral, seller, buyer, tokenAmount, price))`

The on-chain contract verifies both signatures against the tradeHash with the **actual** buyer address and price. The seller's intent signature (with `buyer=address(0)`) is only for auction auth — it will NOT pass on-chain verification.

SDK helper: `computeTradeHash()` from `@sapience/sdk/auction/secondarySigning`.

## Error Handling

**secondary.bid.ack errors** (check `payload.error`):
- `auction_not_found_or_expired` — Secondary auction ended or invalid auctionId
- `invalid_buyer_signature` — Buyer signature verification failed
- `price_below_minimum` — Offered price is below seller's minPrice
