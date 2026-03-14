'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';

import OgShareDialogBase from '~/components/shared/OgShareDialog';
import {
  useForecasts,
  type FormattedAttestation,
} from '~/hooks/graphql/useForecasts';
import { SCHEMA_UID } from '~/lib/constants';

type ShareIntentStored = {
  address: string;
  anchor: 'forecasts';
  clientTimestamp: number;
  og?: { imagePath: string; params?: Record<string, string> };
};

export default function ShareAfterRedirect({ address }: { address: Address }) {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const clearedRef = useRef(false);

  const lowerAddress = String(address).toLowerCase();

  const { data: forecasts } = useForecasts({
    attesterAddress: lowerAddress,
    schemaId: SCHEMA_UID,
  });

  const clearIntent = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      window.sessionStorage.removeItem('sapience:share-intent');
      clearedRef.current = true;
    } catch {
      // ignore
    }
  }, []);

  const readIntent = useCallback((): ShareIntentStored | null => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.sessionStorage.getItem('sapience:share-intent');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ShareIntentStored;
      return parsed || null;
    } catch {
      return null;
    }
  }, []);

  const [currentAnchor, setCurrentAnchor] = useState<'forecasts' | null>(null);

  useEffect(() => {
    const updateAnchor = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash?.replace('#', '').toLowerCase();
      if (raw === 'forecasts') {
        setCurrentAnchor(raw);
      } else {
        setCurrentAnchor(null);
      }
    };

    updateAnchor();

    window.addEventListener('hashchange', updateAnchor);

    return () => window.removeEventListener('hashchange', updateAnchor);
  }, []);

  const toOgUrl = useCallback(
    (entity: FormattedAttestation): string | null => {
      const qp = new URLSearchParams();
      qp.set('addr', lowerAddress);
      try {
        if (entity?.rawTime) qp.set('created', String(entity.rawTime));
        return `/og/forecast?${qp.toString()}`;
      } catch {
        return null;
      }
    },
    [lowerAddress]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (clearedRef.current) return;

    const intent = readIntent();
    if (!intent) return;

    const intentAddr = String(intent.address || '').toLowerCase();
    if (!intentAddr || intentAddr !== lowerAddress) return;
    if (!currentAnchor || currentAnchor !== intent.anchor) return;

    // Path 1: immediate OG provided by caller
    if (intent.og && intent.og.imagePath) {
      try {
        const params = new URLSearchParams(
          Object.fromEntries(
            Object.entries(intent.og.params || {})
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => [k, String(v)])
          )
        );
        const src = `${intent.og.imagePath}?${params.toString()}`;
        setImageSrc(src);
        setOpen(true);
        clearIntent();
        return;
      } catch {
        // fallthrough to resolution
      }
    }

    // Path 2: attempt to resolve via data hooks, up to 60s
    const start = Date.now();
    const windowMs = 2 * 60 * 1000;
    const deadline = start + 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now > deadline) {
        clearInterval(timer);
        clearIntent();
        return;
      }

      const ts = Number(intent.clientTimestamp || 0);
      const minTs = ts - windowMs;

      const list: FormattedAttestation[] = forecasts || [];
      const resolved =
        list.find(
          (f: FormattedAttestation) => Number(f.rawTime) * 1000 >= minTs
        ) || null;

      if (resolved) {
        const src = toOgUrl(resolved);
        if (src) {
          clearInterval(timer);
          setImageSrc(src);
          setOpen(true);
          clearIntent();
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    lowerAddress,
    currentAnchor,
    forecasts,
    readIntent,
    toOgUrl,
    clearIntent,
  ]);

  if (!imageSrc) return null;

  return (
    <OgShareDialogBase
      imageSrc={imageSrc}
      open={open}
      onOpenChange={setOpen}
      title="Trade Submitted"
      shareTitle="Share"
    />
  );
}
