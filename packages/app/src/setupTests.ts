// This file is referenced by jest.config.js in setupFilesAfterEnv, but its contents are currently not needed.
// Keeping it empty satisfies the config without running unnecessary setup code.

import '@testing-library/jest-dom';

// Enable React act() environment for React 19
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Polyfill for TextEncoder/TextDecoder which is needed by viem
class MockTextEncoder {
  encoding = 'utf-8';

  static encode(input: string): Uint8Array {
    return new Uint8Array(Buffer.from(input, 'utf-8'));
  }

  static encodeInto(
    source: string,
    destination: Uint8Array
  ): { read: number; written: number } {
    const buf = Buffer.from(source, 'utf-8');
    const length = Math.min(buf.length, destination.length);
    const newDest = new Uint8Array(destination);
    for (let i = 0; i < length; i++) {
      newDest[i] = buf[i];
    }
    return { read: source.length, written: length };
  }
}

class MockTextDecoder {
  encoding = 'utf-8';

  fatal = false;

  ignoreBOM = false;

  static decode(input?: BufferSource): string {
    if (!input) return '';
    return Buffer.from(input as Buffer).toString('utf-8');
  }
}

// Cast to unknown first, then to the target type to satisfy stricter TS rules
global.TextEncoder = MockTextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = MockTextDecoder as unknown as typeof global.TextDecoder;

// Polyfill Request/Response for Next.js Edge Runtime API route tests
// These are Web APIs available in browsers and Node 18+ but not in jsdom
class MockHeaders {
  private headers: Map<string, string>;

  constructor(init?: Record<string, string> | [string, string][]) {
    this.headers = new Map();
    if (init) {
      const entries = Array.isArray(init) ? init : Object.entries(init);
      for (const [key, value] of entries) {
        this.headers.set(key.toLowerCase(), value);
      }
    }
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) ?? null;
  }

  set(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  has(name: string): boolean {
    return this.headers.has(name.toLowerCase());
  }
}

class MockRequest {
  url: string;
  method: string;
  headers: MockHeaders;

  constructor(
    url: string,
    init?: { method?: string; headers?: Record<string, string> }
  ) {
    this.url = url;
    this.method = init?.method || 'GET';
    this.headers = new MockHeaders(init?.headers);
  }
}

class MockResponse {
  private body: string | null;
  status: number;
  headers: MockHeaders;

  constructor(
    body?: string | null,
    init?: { status?: number; headers?: Record<string, string> }
  ) {
    this.body = body ?? null;
    this.status = init?.status || 200;
    this.headers = new MockHeaders(init?.headers);
  }

  json(): Promise<unknown> {
    return Promise.resolve(this.body ? JSON.parse(this.body) : null);
  }

  text(): Promise<string> {
    return Promise.resolve(this.body ?? '');
  }
}

// Only polyfill if not already defined (e.g., in Node 18+)
if (typeof globalThis.Request === 'undefined') {
  globalThis.Request = MockRequest as unknown as typeof globalThis.Request;
}
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = MockResponse as unknown as typeof globalThis.Response;
}
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = MockHeaders as unknown as typeof globalThis.Headers;
}
