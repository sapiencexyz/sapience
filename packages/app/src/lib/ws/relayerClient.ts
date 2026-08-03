'use client';

import { ReconnectingWebSocketClient } from './ReconnectingWebSocket';

/**
 * Single shared socket to the relayer. The vault share-quote subscription is
 * the only consumer, but keeping it shared means a remount doesn't tear down
 * and re-establish the connection.
 */
const shared = new ReconnectingWebSocketClient(null, {
  maxBackoffMs: 30_000,
});

export function getSharedRelayerClient(
  wsUrl: string | null
): ReconnectingWebSocketClient {
  shared.setUrl(wsUrl);
  return shared;
}
