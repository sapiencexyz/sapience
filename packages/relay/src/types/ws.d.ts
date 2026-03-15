declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage, Server as HttpServer } from 'http';

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    static readonly CONNECTING: number;

    readyState: number;

    constructor(address: string);
    send(data: string | Buffer, cb?: (err?: Error) => void): void;
    close(code?: number, reason?: string): void;
    ping(data?: unknown): void;
    terminate(): void;

    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'message', listener: (data: Buffer | string) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'pong', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;

    onopen: ((ev: Event) => void) | null;
    onclose: ((ev: CloseEvent) => void) | null;
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: Event) => void) | null;
  }

  interface ServerOptions {
    port?: number;
    host?: string;
    server?: HttpServer;
    path?: string;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options: ServerOptions, callback?: () => void);
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    close(cb?: () => void): void;
  }

  export { WebSocket, WebSocketServer };
  export default WebSocket;
}
