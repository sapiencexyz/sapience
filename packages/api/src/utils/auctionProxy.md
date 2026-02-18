# Auction Service Reverse Proxy

The API service includes a built-in reverse proxy for the auction WebSocket service. This allows the frontend to continue using the same URL pattern (`ws://api.example.com/auction`) while the auction service runs independently.

## Configuration

### Environment Variables

- `RELAYER_SERVICE_URL`: URL of the relayer WebSocket service (default: `http://localhost:3002`)
- `ENABLE_AUCTION_PROXY`: Enable/disable the proxy (default: `true`, set to `false` to disable)

### Example

```bash
# Development (default)
RELAYER_SERVICE_URL=http://localhost:3002

# Production
RELAYER_SERVICE_URL=http://relayer:3002
# or
RELAYER_SERVICE_URL=https://relayer.example.com
```

## How It Works

1. **HTTP Requests**: Express middleware (`http-proxy-middleware`) proxies all HTTP requests to `/auction` to the auction service
2. **WebSocket Upgrades**: Custom handler in the upgrade event proxies WebSocket connections to the auction service

## Benefits

- ✅ Frontend doesn't need to change - continues using `/auction` endpoint
- ✅ No external nginx/reverse proxy needed
- ✅ Can be disabled via environment variable
- ✅ Works for both HTTP and WebSocket connections

## Testing

1. Start the auction service:

   ```bash
   pnpm dev:auction
   ```

2. Start the API service:

   ```bash
   pnpm dev:api:service
   ```

3. Connect to the auction service via the API proxy:
   ```javascript
   const ws = new WebSocket('ws://localhost:3001/auction');
   ```

The proxy will forward the connection to `ws://localhost:3002/auction`.
