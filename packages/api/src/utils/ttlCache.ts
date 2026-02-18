export interface TtlCacheOptions {
  ttlMs: number;
  maxSize?: number;
}

type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

// Simple TTL cache with optional crude size bound. Not LRU, but sufficient for short TTLs.
export class TtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly ttlMs: number;
  private readonly maxSize: number | undefined;

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxSize = options.maxSize;
  }

  get(key: K): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: K, value: V): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.store.set(key, { value, expiresAt });
    if (this.maxSize && this.store.size > this.maxSize) {
      // Crude eviction of oldest insertion
      const firstKey = this.store.keys().next().value as K | undefined;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }
}
