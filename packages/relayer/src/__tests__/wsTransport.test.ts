import { describe, it, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createWsClientConnection } from '../transport/wsTransport';

// Mock ws module — we only need the WebSocket constants and a mock instance
vi.mock('ws', () => {
  const OPEN = 1;
  const CLOSED = 3;
  return {
    WebSocket: { OPEN, CLOSED },
  };
});

function mockWs(readyState: number = WebSocket.OPEN) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('createWsClientConnection', () => {
  it('generates a unique id', () => {
    const ws = mockWs();
    const client = createWsClientConnection(ws);
    expect(client.id).toBeDefined();
    expect(typeof client.id).toBe('string');
    expect(client.id.length).toBeGreaterThan(0);
  });

  it('two connections get different ids', () => {
    const a = createWsClientConnection(mockWs());
    const b = createWsClientConnection(mockWs());
    expect(a.id).not.toBe(b.id);
  });

  describe('send()', () => {
    it('JSON-serializes objects and sends when OPEN', () => {
      const ws = mockWs();
      const client = createWsClientConnection(ws);
      client.send({ type: 'auction.ack', payload: { auctionId: '123' } });
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'auction.ack', payload: { auctionId: '123' } })
      );
    });

    it('sends pre-serialized strings as-is', () => {
      const ws = mockWs();
      const client = createWsClientConnection(ws);
      const raw = '{"type":"test"}';
      client.send(raw);
      expect(ws.send).toHaveBeenCalledWith(raw);
    });

    it('does not send when socket is not OPEN', () => {
      const ws = mockWs(WebSocket.CLOSED);
      const client = createWsClientConnection(ws);
      client.send({ type: 'test' });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('logs warning when socket is not OPEN', () => {
      const ws = mockWs(WebSocket.CLOSED);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = createWsClientConnection(ws);
      client.send({ type: 'test' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-OPEN socket')
      );
      warnSpy.mockRestore();
    });
  });

  describe('onSend hook', () => {
    it('fires with message type after successful send', () => {
      const ws = mockWs();
      const onSend = vi.fn();
      const client = createWsClientConnection(ws, { onSend });
      client.send({ type: 'auction.ack', payload: {} });
      expect(onSend).toHaveBeenCalledWith('auction.ack');
    });

    it('fires with "unknown" when message has no type field', () => {
      const ws = mockWs();
      const onSend = vi.fn();
      const client = createWsClientConnection(ws, { onSend });
      client.send({ data: 'no type' });
      expect(onSend).toHaveBeenCalledWith('unknown');
    });

    it('fires with parsed type for pre-serialized strings', () => {
      const ws = mockWs();
      const onSend = vi.fn();
      const client = createWsClientConnection(ws, { onSend });
      client.send('{"type":"bid.ack"}');
      expect(onSend).toHaveBeenCalledWith('bid.ack');
    });

    it('fires with "unknown" for malformed pre-serialized string', () => {
      const ws = mockWs();
      const onSend = vi.fn();
      const client = createWsClientConnection(ws, { onSend });
      client.send('not json');
      expect(onSend).toHaveBeenCalledWith('unknown');
    });

    it('does not fire when socket is not OPEN', () => {
      const ws = mockWs(WebSocket.CLOSED);
      const onSend = vi.fn();
      const client = createWsClientConnection(ws, { onSend });
      client.send({ type: 'test' });
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('delegates to ws.close with code and reason', () => {
      const ws = mockWs();
      const client = createWsClientConnection(ws);
      client.close(1000, 'normal');
      expect(ws.close).toHaveBeenCalledWith(1000, 'normal');
    });

    it('delegates to ws.close without arguments', () => {
      const ws = mockWs();
      const client = createWsClientConnection(ws);
      client.close();
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('isOpen', () => {
    it('returns true when socket is OPEN', () => {
      const ws = mockWs(WebSocket.OPEN);
      const client = createWsClientConnection(ws);
      expect(client.isOpen).toBe(true);
    });

    it('returns false when socket is CLOSED', () => {
      const ws = mockWs(WebSocket.CLOSED);
      const client = createWsClientConnection(ws);
      expect(client.isOpen).toBe(false);
    });

    it('reflects live readyState changes', () => {
      const ws = mockWs(WebSocket.OPEN);
      const client = createWsClientConnection(ws);
      expect(client.isOpen).toBe(true);
      // Simulate state change
      (ws as unknown as { readyState: number }).readyState = WebSocket.CLOSED;
      expect(client.isOpen).toBe(false);
    });
  });
});
