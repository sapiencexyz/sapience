'use client';

import { useState, useEffect } from 'react';

function isEnabledValue(raw: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.toLowerCase().trim();
  return normalized === '1' || normalized === 'true';
}

/**
 * Feature flag backed by localStorage with URL-param override.
 *
 * Visit any page with `?<paramName>=1` to enable, `?<paramName>=0` to disable.
 * The value persists in localStorage under `sapience.flags.<storageKey>`.
 */
export function useFeatureFlag(storageKey: string, paramName: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fullKey = `sapience.flags.${storageKey}`;

    const readFromStorage = (): boolean => {
      try {
        return isEnabledValue(window.localStorage.getItem(fullKey));
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

      if (isEnabledValue(param)) {
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
  }, [storageKey, paramName]);

  return enabled;
}
