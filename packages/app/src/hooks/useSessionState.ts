import { useState, useEffect } from 'react';

/**
 * Custom JSON serializer that handles Infinity / -Infinity
 * (JSON.stringify turns them into null).
 */
function serialize<T>(value: T): string {
  return JSON.stringify(value, (_key, v) => {
    if (v === Infinity) return '__INF__';
    if (v === -Infinity) return '__NEG_INF__';
    return v;
  });
}

function deserialize<T>(raw: string): T {
  return JSON.parse(raw, (_key, v) => {
    if (v === '__INF__') return Infinity;
    if (v === '__NEG_INF__') return -Infinity;
    return v;
  }) as T;
}

/**
 * Drop-in replacement for `useState` that persists to `sessionStorage`.
 *
 * - Reads stored value on mount (lazy initializer), falls back to `defaultValue`
 * - Writes back on every state change via `useEffect`
 * - Handles `Infinity` / `-Infinity` correctly
 * - SSR-safe (no-ops when `window` is unavailable)
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored !== null) return deserialize<T>(stored);
    } catch {
      // Storage unavailable or corrupt — fall through
    }
    return defaultValue;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, serialize(value));
    } catch {
      // Quota exceeded or storage unavailable
    }
  }, [key, value]);

  return [value, setValue];
}
