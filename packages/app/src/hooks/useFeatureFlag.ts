'use client';

import { useState, useEffect } from 'react';

function isEnabledFlagValue(raw: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.toLowerCase().trim();
  return normalized === '1' || normalized === 'true';
}

/**
 * Read a feature flag from localStorage + URL search params.
 *
 * - localStorage key: `sapience.flags.${storageKey}`
 * - URL param `paramName` enables/disables and persists to localStorage
 * - The URL param is cleared after reading via `history.replaceState`
 */
export function useFeatureFlag(storageKey: string, paramName: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fullKey = `sapience.flags.${storageKey}`;

    const readFromStorage = (): boolean => {
      try {
        return isEnabledFlagValue(window.localStorage.getItem(fullKey));
      } catch {
        return false;
      }
    };

    const clearUrlParam = (url: URL): void => {
      url.searchParams.delete(paramName);
      window.history.replaceState({}, '', url.toString());
    };

    try {
      const url = new URL(window.location.href);
      const param = url.searchParams.get(paramName);

      if (isEnabledFlagValue(param)) {
        try {
          window.localStorage.setItem(fullKey, '1');
        } catch {
          // Storage unavailable
        }
        clearUrlParam(url);
        setEnabled(true);
        return;
      }

      if (param === '0' || param?.toLowerCase() === 'false') {
        try {
          window.localStorage.removeItem(fullKey);
        } catch {
          // Storage unavailable
        }
        clearUrlParam(url);
        setEnabled(false);
        return;
      }

      setEnabled(readFromStorage());
    } catch {
      setEnabled(readFromStorage());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return enabled;
}
