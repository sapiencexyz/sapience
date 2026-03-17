import type { MeshClient } from './MeshClient';

/**
 * Adapts MeshClient to the same interface that ReconnectingWebSocketClient exposes,
 * so auction hooks (useAuctionStart, useEscrowBidSubmission, etc.) work unchanged.
 */
export class MeshTransport {
  private mesh: MeshClient;

  constructor(mesh: MeshClient) {
    this.mesh = mesh;
  }

  send(msg: Record<string, unknown>): void {
    const type = (msg.type as string) ?? 'unknown';
    this.mesh.broadcast(type, msg);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendWithAck<T = unknown>(
    _type: string,
    _payload: Record<string, unknown>,
    _opts?: { timeoutMs?: number }
  ): Promise<T> {
    throw new Error(
      'sendWithAck is not supported on MeshTransport — use WS transport for ack flows'
    );
  }

  addMessageListener(cb: (msg: unknown) => void): () => void {
    return this.mesh.onAny((_type, payload) => cb(payload));
  }

  addOpenListener(cb: () => void): () => void {
    let wasOpen = false;
    return this.mesh.onPeerCountChange((count) => {
      if (count > 0 && !wasOpen) {
        wasOpen = true;
        cb();
      } else if (count === 0) {
        wasOpen = false;
      }
    });
  }

  addCloseListener(cb: () => void): () => void {
    let wasOpen = false;
    return this.mesh.onPeerCountChange((count) => {
      if (count > 0) wasOpen = true;
      else if (count === 0 && wasOpen) {
        wasOpen = false;
        cb();
      }
    });
  }

  addReconnectListener(_cb: () => void): () => void {
    return () => {};
  }

  addErrorListener(_cb: (e: unknown) => void): () => void {
    return () => {};
  }
}
