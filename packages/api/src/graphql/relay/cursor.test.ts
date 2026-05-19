import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor';

describe('cursor — encode / decode roundtrip', () => {
  it('round-trips a typical payload', () => {
    const payload = { k: '12345', id: 'cond-abc-def' };
    const encoded = encodeCursor(payload);
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('round-trips empty string values', () => {
    const payload = { k: '', id: '' };
    const encoded = encodeCursor(payload);
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('round-trips values with special characters', () => {
    const payload = { k: 'café/+=&?', id: 'id with spaces' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('produces a URL-safe (base64url) string with no padding', () => {
    const encoded = encodeCursor({ k: 'short', id: 'id' });
    // base64url uses [-_A-Za-z0-9], never `+`, `/`, or `=`.
    expect(encoded).toMatch(/^[-_A-Za-z0-9]+$/);
  });
});

describe('cursor — decode error handling', () => {
  it('returns null for malformed base64', () => {
    // `!` is not a valid base64url character.
    expect(decodeCursor('!!!not-base64!!!')).toBeNull();
  });

  it('returns null when the decoded body is not JSON', () => {
    const garbage = Buffer.from('plain text not json', 'utf-8').toString(
      'base64url'
    );
    expect(decodeCursor(garbage)).toBeNull();
  });

  it('returns null when JSON is missing required fields', () => {
    const partial = Buffer.from(JSON.stringify({ k: 'x' }), 'utf-8').toString(
      'base64url'
    );
    expect(decodeCursor(partial)).toBeNull();
  });

  it('returns null when fields are present but wrong type', () => {
    const wrongType = Buffer.from(
      JSON.stringify({ k: 123, id: 'abc' }),
      'utf-8'
    ).toString('base64url');
    expect(decodeCursor(wrongType)).toBeNull();
  });

  it('returns null for empty string input', () => {
    expect(decodeCursor('')).toBeNull();
  });
});
