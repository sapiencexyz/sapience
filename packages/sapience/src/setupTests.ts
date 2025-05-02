// This file is referenced by jest.config.js in setupFilesAfterEnv, but its contents are currently not needed.
// Keeping it empty satisfies the config without running unnecessary setup code.

/* eslint-disable max-classes-per-file, import/no-extraneous-dependencies */
import '@testing-library/jest-dom';

// Polyfill for TextEncoder/TextDecoder which is needed by viem
class MockTextEncoder {
  encoding = 'utf-8';

  static encode(input: string): Uint8Array {
    return Buffer.from(input, 'utf-8');
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
