'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { formatUnits } from 'viem';

import OgShareDialogBase from '~/components/shared/OgShareDialog';
import {
  useForecasts,
  type FormattedAttestation,
} from '~/hooks/graphql/useForecasts';
import { useUserParlays, type Parlay } from '~/hooks/graphql/useUserParlays';
import { SCHEMA_UID } from '~/lib/constants';

type Anchor = 'forecasts' | 'positions';

type ShareIntentStored = {
  address: string;
  anchor: Anchor;
  clientTimestamp: number;
  og?: { imagePath: string; params?: Record<string, any> };
};

export default function ShareAfterRedirect({ address }: { address: Address }) {
  const [open, setOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const clearedRef = useRef(false);

  const lowerAddress = String(address).toLowerCase();

  // Data hooks for fallback resolution
  const { data: forecasts } = useForecasts({
    attesterAddress: lowerAddress,
    schemaId: SCHEMA_UID,
  });
  const { data: positions } = useUserParlays({ address: lowerAddress });

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

  const [currentAnchor, setCurrentAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const updateAnchor = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash?.replace('#', '').toLowerCase();
      if (raw === 'forecasts' || raw === 'positions') {
        setCurrentAnchor(raw);
      } else {
        setCurrentAnchor(null);
      }
    };

    // Update immediately
    updateAnchor();

    // Listen for hash changes
    window.addEventListener('hashchange', updateAnchor);

    return () => window.removeEventListener('hashchange', updateAnchor);
  }, []);

  // Build minimal OG url from resolved entities
  const toOgUrl = useCallback(
    (anchor: Anchor, entity: FormattedAttestation | Parlay): string | null => {
      const qp = new URLSearchParams();
      qp.set('addr', lowerAddress);
      try {
        if (anchor === 'forecasts' && entity) {
          const f = entity as FormattedAttestation;
          if (f?.rawTime) qp.set('created', String(f.rawTime));
          return `/og/forecast?${qp.toString()}`;
        }
        if (anchor === 'positions' && entity) {
          // Encode all legs with question and prediction choice
          const position = entity as Parlay;
          const legs = (position?.predictedOutcomes || [])
            .map((o) => {
              const question =
                (o?.condition?.shortName as string) ||
                (o?.condition?.question as string);
              const choice = o?.prediction ? 'Yes' : 'No';
              return question ? `${question}|${choice}` : null;
            })
            .filter(Boolean);
          if (legs.length > 0) {
            legs.forEach((l) => qp.append('leg', String(l)));
          }

          const collateralDecimals = 18;
          const collateralSymbol = 'testUSDe';
          if (position?.makerCollateral) {
            const wager = parseFloat(
              formatUnits(BigInt(position.makerCollateral), collateralDecimals)
            ).toFixed(2);
            qp.set('wager', wager);
          }

          if (position?.totalCollateral) {
            const totalCollateralBigInt = BigInt(position.totalCollateral);
            const payout = parseFloat(
              formatUnits(totalCollateralBigInt, collateralDecimals)
            ).toFixed(2);
            qp.set('payout', payout);
          }

          qp.set('symbol', collateralSymbol);

          return `/og/position?${qp.toString()}`;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [lowerAddress]
  );

  // Main effect: attempt to resolve and show
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (clearedRef.current) return;

    const intent = readIntent();
    if (!intent) return;

    // Validate address and anchor
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
    const windowMs = 2 * 60 * 1000; // 2 minutes
    const deadline = start + 60 * 1000; // give up after 60s
    const timer = setInterval(() => {
      const now = Date.now();
      if (now > deadline) {
        clearInterval(timer);
        clearIntent();
        return;
      }

      const ts = Number(intent.clientTimestamp || 0);
      const minTs = ts - windowMs;

      let resolved: FormattedAttestation | Parlay | null = null;

      if (intent.anchor === 'forecasts') {
        const list: FormattedAttestation[] = forecasts || [];
        resolved =
          list.find(
            (f: FormattedAttestation) => Number(f.rawTime) * 1000 >= minTs
          ) || null;
      } else if (intent.anchor === 'positions') {
        const list: Parlay[] = positions || [];
        const filtered = list.filter(
          (p: Parlay) => Number(p.mintedAt) * 1000 >= minTs
        );
        resolved =
          filtered.sort(
            (a: Parlay, b: Parlay) => Number(b.mintedAt) - Number(a.mintedAt)
          )[0] || null;
      }

      if (resolved) {
        const src = toOgUrl(intent.anchor, resolved);
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
    positions,
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
      title="Share"
      shareTitle="Share"
    />
  );
}
