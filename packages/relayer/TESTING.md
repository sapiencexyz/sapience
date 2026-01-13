# Testing the Auction WebSocket Service

## Quick Test Commands

### Test via Proxy (API -> Relayer)
```bash
# From repo root
pnpm --filter @sapience/relayer run test:proxy

# Or directly
node packages/relayer/test-proxy.js
```

This tests the reverse proxy setup where:
- Client connects to: `ws://localhost:3001/auction` (API service)
- API proxies to: `ws://localhost:3002/auction` (Auction service)

### Test Direct Connection (Auction Service Only)
```bash
# From repo root
pnpm --filter @sapience/relayer run test:proxy:direct

# Or directly
node packages/relayer/test-proxy.js --direct
```

This tests direct connection to the auction service:
- Client connects to: `ws://localhost:3002/auction` (Auction service)

## Manual Testing with Node.js REPL

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001/auction');

ws.on('open', () => {
  console.log('Connected!');
  ws.send(JSON.stringify({
    type: 'auction.start',
    payload: {
      taker: '0x1234567890123456789012345678901234567890',
      wager: '1000000000000000000',
      resolver: '0x0000000000000000000000000000000000000000',
      predictedOutcomes: ['0xdeadbeef'],
      takerNonce: 1,
      chainId: 42161,
    },
  }));
});

ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data.toString()));
});
```

## Using wscat (if installed)

```bash
# Install wscat globally
npm install -g wscat

# Test via proxy
wscat -c ws://localhost:3001/auction

# Test direct
wscat -c ws://localhost:3002/auction
```

Then send a message (basic example without signature):
```json
{"type":"auction.start","payload":{"taker":"0x1234567890123456789012345678901234567890","wager":"1000000000000000000","resolver":"0x0000000000000000000000000000000000000000","predictedOutcomes":["0xdeadbeef"],"takerNonce":1,"chainId":42161}}
```

**Note:** For production use or when interacting with market makers that require signatures, include `takerSignature` and `takerSignedAt` fields. See the main README.md for examples using the SDK's `createAuctionStartSiweMessage` helper.

## Expected Output

When the test script runs successfully, you should see:

```
Connecting to: ws://localhost:3001/auction
Mode: Via Proxy (API -> Auction)

✅ Connected successfully!

📤 Sending auction.start message...
📥 Received message:
{
  "type": "auction.ack",
  "payload": {
    "auctionId": "some-uuid-here"
  }
}

✅ Success! Received auction.ack - proxy is working!
   Auction ID: some-uuid-here

Closing connection in 2 seconds...

🔌 Connection closed (code: 1000, reason: none)
```

## Troubleshooting

### Connection Refused
- Make sure both services are running:
  - API: `pnpm dev:api:service` (port 3001)
  - Auction: `pnpm dev:auction` (port 3002)

### Proxy Not Working
- Check that `ENABLE_AUCTION_PROXY` is not set to `false`
- Verify `RELAYER_SERVICE_URL` is set correctly (default: `http://localhost:3002`)
- Check API service logs for proxy errors

### No Response
- Check auction service logs for errors
- Verify the auction service is accepting connections
- Try direct connection first to isolate the issue

