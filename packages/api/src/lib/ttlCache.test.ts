import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get/set with TTL expiry', () => {
    it('returns a set value before the TTL elapses', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 42);

      expect(cache.get('a')).toBe(42);
      vi.advanceTimersByTime(999);
      expect(cache.get('a')).toBe(42);
    });

    it('still serves the value at exactly the expiry instant (expiresAt >= now is live)', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 42);

      vi.advanceTimersByTime(1_000);
      expect(cache.get('a')).toBe(42);
    });

    it('returns undefined once the TTL has passed and evicts the entry', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 42);

      vi.advanceTimersByTime(1_001);
      expect(cache.get('a')).toBeUndefined();
      // The expired entry was evicted on read, not just hidden.
      expect(cache.size()).toBe(0);
    });

    it('returns undefined for a key that was never set', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      expect(cache.get('missing')).toBeUndefined();
    });

    it('re-setting a key refreshes its TTL', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      vi.advanceTimersByTime(900);
      cache.set('a', 2);
      vi.advanceTimersByTime(900); // 1_800 total, but only 900 since re-set
      expect(cache.get('a')).toBe(2);
    });
  });

  describe('size()', () => {
    it('counts all stored entries, including expired ones not yet evicted', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      vi.advanceTimersByTime(2_000);
      cache.set('b', 2);

      // 'a' is expired but has not been read (so not evicted).
      expect(cache.size()).toBe(2);
    });
  });

  describe('liveSize()', () => {
    it('counts only entries still within their TTL', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      vi.advanceTimersByTime(2_000);
      cache.set('b', 2);

      expect(cache.size()).toBe(2);
      expect(cache.liveSize()).toBe(1);
    });

    it('counts an entry at exactly its expiry instant as live (>= boundary)', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      vi.advanceTimersByTime(1_000);

      expect(cache.liveSize()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(cache.liveSize()).toBe(0);
    });
  });

  describe('delete()', () => {
    it('removes the entry so the next get misses', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      cache.set('b', 2);

      cache.delete('a');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.size()).toBe(1);
    });

    it('is a no-op for a missing key', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      expect(() => cache.delete('missing')).not.toThrow();
      expect(cache.size()).toBe(1);
    });
  });

  describe('clear()', () => {
    it('drops every entry', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000 });
      cache.set('a', 1);
      cache.set('b', 2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('a')).toBeUndefined();
    });
  });

  describe('maxSize eviction', () => {
    it('evicts the oldest insertion once maxSize is exceeded', () => {
      const cache = new TtlCache<string, number>({ ttlMs: 1_000, maxSize: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size()).toBe(2);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
    });
  });
});
