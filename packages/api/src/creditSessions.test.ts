import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createCreditSession,
  getSession,
  deductCredits,
  extractPayerFromPaymentHeader,
  _resetForTest,
} from './creditSessions';

beforeEach(() => {
  _resetForTest();
});

afterEach(() => {
  _resetForTest();
});

describe('createCreditSession', () => {
  it('creates a session with a hex token', () => {
    const result = createCreditSession('0xabc', 1_000_000, 3600_000);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.credits).toBe(1_000_000);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('returns different tokens for each session', () => {
    const a = createCreditSession('0xabc', 1000, 60000);
    const b = createCreditSession('0xabc', 1000, 60000);
    expect(a.token).not.toBe(b.token);
  });
});

describe('getSession', () => {
  it('returns session for valid token', () => {
    const { token } = createCreditSession('0xabc', 5000, 60000);
    const session = getSession(token);
    expect(session).not.toBeNull();
    expect(session!.wallet).toBe('0xabc');
    expect(session!.credits).toBe(5000);
  });

  it('returns null for unknown token', () => {
    expect(getSession('nonexistent')).toBeNull();
  });

  it('returns null for expired session', () => {
    vi.useFakeTimers();
    const { token } = createCreditSession('0xabc', 5000, 1000); // 1s TTL
    vi.advanceTimersByTime(2000);
    expect(getSession(token)).toBeNull();
    vi.useRealTimers();
  });
});

describe('deductCredits', () => {
  it('deducts credits and returns true when sufficient', () => {
    const { token } = createCreditSession('0xabc', 10000, 60000);
    expect(deductCredits(token, 5000)).toBe(true);
    expect(getSession(token)!.credits).toBe(5000);
  });

  it('returns false when insufficient credits', () => {
    const { token } = createCreditSession('0xabc', 3000, 60000);
    expect(deductCredits(token, 5000)).toBe(false);
    // Credits should not have changed
    expect(getSession(token)!.credits).toBe(3000);
  });

  it('returns false for unknown token', () => {
    expect(deductCredits('nonexistent', 100)).toBe(false);
  });

  it('deducts exactly to zero', () => {
    const { token } = createCreditSession('0xabc', 5000, 60000);
    expect(deductCredits(token, 5000)).toBe(true);
    expect(getSession(token)!.credits).toBe(0);
    // Next deduction should fail
    expect(deductCredits(token, 1)).toBe(false);
  });
});

describe('extractPayerFromPaymentHeader', () => {
  it('extracts from authorization.from', () => {
    const header = Buffer.from(
      JSON.stringify({ authorization: { from: '0xpayer' } })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xpayer');
  });

  it('extracts from permit2Authorization.from', () => {
    const header = Buffer.from(
      JSON.stringify({ permit2Authorization: { from: '0xpermit2payer' } })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xpermit2payer');
  });

  it('prefers authorization over permit2Authorization', () => {
    const header = Buffer.from(
      JSON.stringify({
        authorization: { from: '0xauth' },
        permit2Authorization: { from: '0xpermit2' },
      })
    ).toString('base64');
    expect(extractPayerFromPaymentHeader(header)).toBe('0xauth');
  });

  it('returns null for invalid base64', () => {
    expect(extractPayerFromPaymentHeader('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for JSON without from field', () => {
    const header = Buffer.from(JSON.stringify({ foo: 'bar' })).toString(
      'base64'
    );
    expect(extractPayerFromPaymentHeader(header)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractPayerFromPaymentHeader('')).toBeNull();
  });
});
