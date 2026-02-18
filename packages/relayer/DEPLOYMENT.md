# Auction WebSocket Service Deployment Guide

## Overview

The relayer service is a standalone WebSocket server that handles auction and bid matching for the prediction market system. It runs independently from the main API service.

## Local Development

### Prerequisites
- Node.js >= 24.11.0
- pnpm 9.x
- Environment variables configured (see below)

### Running Locally

```bash
# From repo root
pnpm dev:auction

# Or from package directory
pnpm --filter @sapience/relayer run dev
```

The service will start on `http://localhost:3002` with WebSocket endpoint at `ws://localhost:3002/auction`.

## Environment Variables

### Required
- `PORT`: Server port (default: 3002)
- `NODE_ENV`: Environment (`development`, `production`, or `test`)

### Optional
- `ENABLE_AUCTION_WS`: Enable WebSocket server (default: `true`)
- `INFURA_API_KEY`: Infura API key for blockchain RPC calls
- `RPC_URL`: Custom RPC URL for specific chains (e.g., Converge chain)
- `CHAIN_5064014_RPC_URL`: Custom RPC URL for EtherealChain

## Production Deployment

### Render.com

The service is configured in `render.yaml` as a web service:

```yaml
- name: relayer
  type: web
  env: node
  plan: standard
  buildCommand: npm install -g pnpm@9 && bash render-build-sdk.sh
  startCommand: pnpm --filter @sapience/relayer start
```

### Environment Variables for Production

Set these in your deployment platform:

- `PORT`: `3002` (or your configured port)
- `NODE_ENV`: `production`
- `ENABLE_AUCTION_WS`: `true`
- `INFURA_API_KEY`: Your Infura API key (if using Infura)
- Any chain-specific RPC URLs if needed

## Reverse Proxy Setup

### Render.com (Recommended)

If deploying to Render, no reverse proxy setup is needed. Render handles routing internally. The service is configured in `render.yaml` and will be accessible at its own URL (e.g., `https://relayer.sapience.xyz`).

### Self-Hosted Setup

If self-hosting, set up a reverse proxy to route `/auction` requests to the relayer service. Example nginx configuration:

```nginx
location /auction {
    proxy_pass http://localhost:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
}
```

### Alternative: Update Frontend Configuration

Alternatively, update the frontend to point directly to the relayer service:

1. Update `packages/sapience/src/lib/ws.ts`:
   ```typescript
   export function toAuctionWsUrl(baseHttpUrl: string | null | undefined): string | null {
     // Return relayer service URL directly
     return process.env.NEXT_PUBLIC_AUCTION_WS_URL || 'ws://localhost:3002/auction';
   }
   ```

2. Set environment variable:
   ```
   NEXT_PUBLIC_AUCTION_WS_URL=wss://relayer.example.com/auction
   ```

## Health Checks

The service doesn't currently expose a health check endpoint. For production deployments, you may want to add:

```typescript
// In server.ts
httpServer.on('request', (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }
  // ... handle other routes
});
```

## Monitoring

- **Sentry**: Error tracking is configured (production only)
- **Logs**: Check service logs for WebSocket connection issues
- **Prometheus Metrics**: The service exposes metrics at `/metrics` endpoint
  - Active connections count
  - Messages sent/received by type
  - Rate limit hits
  - Auction and bid operations
  - Error counts by type
  - Message processing duration
  - Subscription counts

### Metrics Endpoint

The service exposes Prometheus-compatible metrics at `http://localhost:${PORT}/metrics` (or your production URL).

Example metrics:
- `relayer_connections_active` - Current active WebSocket connections
- `relayer_messages_received_total` - Total messages received by type
- `relayer_messages_sent_total` - Total messages sent by type
- `relayer_auctions_started_total` - Total auctions started
- `relayer_bids_submitted_total` - Total bids submitted with status labels
- `relayer_rate_limit_hits_total` - Total rate limit violations
- `relayer_errors_total` - Total errors by type and message type
- `relayer_message_processing_duration_seconds` - Processing time histogram

You can scrape these metrics with Prometheus or view them directly in your browser.

## Scaling

The relayer service can be scaled horizontally, but note:
- Auction state is in-memory (not shared between instances)
- Each instance maintains its own auction registry
- For production, consider:
  - Sticky sessions (route same client to same instance)
  - Or implement shared state (Redis, database, etc.)

## Troubleshooting

### WebSocket Connection Fails
1. Check service is running: `curl http://localhost:3002/health` (if health endpoint exists)
2. Verify port is not blocked by firewall
3. Check reverse proxy configuration
4. Verify `ENABLE_AUCTION_WS` is set to `true`

### Rate Limiting Issues
- Default: 100 messages per 10 seconds
- Adjust `RATE_LIMIT_MAX_MESSAGES` and `RATE_LIMIT_WINDOW_MS` in `ws.ts` if needed

### High Memory Usage
- Auctions expire after their deadline (default 60s, max 5 minutes)
- Cleanup runs every 30 seconds
- Monitor for memory leaks in long-running connections

## Testing

### Manual Testing with Bot Example

```bash
FOIL_RELAYER_BASE=http://localhost:3002 pnpm --filter @sapience/relayer run bot
```

### Integration Testing

1. Start the service: `pnpm dev:auction`
2. Connect via WebSocket client
3. Send `auction.start` message
4. Verify `auction.ack` response
5. Send `bid.submit` from another client
6. Verify `auction.bids` broadcast

## Security Considerations

1. **Rate Limiting**: Enabled by default (100 msg/10s)
2. **Message Size**: Limited to 64KB
3. **Origin Validation**: Consider adding origin validation for production
4. **TLS**: Use WSS (wss://) in production
5. **Authentication**: Consider adding authentication for production use

