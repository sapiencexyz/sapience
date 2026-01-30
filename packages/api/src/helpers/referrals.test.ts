import { describe, it, expect } from 'vitest';
import { hashReferralCode } from '../helpers/referrals';

describe('hashReferralCode', () => {
  it('produces consistent hash for same input', () => {
    const hash1 = hashReferralCode('TEST123');
    const hash2 = hashReferralCode('TEST123');
    expect(hash1).toBe(hash2);
  });

  it('normalizes to lowercase before hashing', () => {
    const hash1 = hashReferralCode('TEST123');
    const hash2 = hashReferralCode('test123');
    const hash3 = hashReferralCode('TeSt123');
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('trims whitespace before hashing', () => {
    const hash1 = hashReferralCode('TEST123');
    const hash2 = hashReferralCode('  TEST123  ');
    const hash3 = hashReferralCode('\tTEST123\n');
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  it('returns 0x-prefixed hex string', () => {
    const hash = hashReferralCode('TEST123');
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
  });

  it('throws for empty string', () => {
    expect(() => hashReferralCode('')).toThrow();
    expect(() => hashReferralCode('   ')).toThrow();
  });

  it('throws for codes exceeding 16 characters', () => {
    expect(() => hashReferralCode('EXACTLY16CHARS!!')).not.toThrow(); // 16 chars
    expect(() => hashReferralCode('SEVENTEENCHARS!!!')).toThrow(); // 17 chars
    expect(() => hashReferralCode('THIS_IS_WAY_TOO_LONG_FOR_A_CODE')).toThrow();
  });

  it('produces different hashes for different codes', () => {
    const hash1 = hashReferralCode('CODE1');
    const hash2 = hashReferralCode('CODE2');
    expect(hash1).not.toBe(hash2);
  });
});
