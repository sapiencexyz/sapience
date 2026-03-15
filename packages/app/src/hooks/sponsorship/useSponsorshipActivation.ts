'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { logPositionForm } from '~/lib/auction/bidLogger';

const SPONSOR_TIMEOUT_MS = 10_000;

interface UseSponsorshipActivationOptions {
  /** Called when the user activates sponsorship — should trigger a re-quote with sponsor */
  onActivate: () => void;
  /** Called when the timeout fires — should restart the auction without sponsor */
  onTimeout: () => void;
}

/**
 * Encapsulates the sponsorship activation state machine:
 *
 * 1. User clicks "Use" → `activateSponsor()` → sets both flags, fires `onActivate`
 * 2. A sponsored bid arrives → consumer calls `clearAwaiting()` → clears the awaiting flag
 * 3. If no bid arrives within 10s → timeout resets both flags and fires `onTimeout`
 * 4. External reset (position size / selections change) → `resetSponsor()` clears everything
 */
export function useSponsorshipActivation({
  onActivate,
  onTimeout,
}: UseSponsorshipActivationOptions) {
  const [sponsorshipActivated, setSponsorshipActivated] = useState(false);
  const [awaitingSponsoredBid, setAwaitingSponsoredBid] = useState(false);

  // Keep callbacks in refs so effects/callbacks don't re-trigger on every render
  const onActivateRef = useRef(onActivate);
  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Timeout: if awaitingSponsoredBid stays true for 10s, reset and restart
  useEffect(() => {
    if (!awaitingSponsoredBid) return;
    const timer = window.setTimeout(() => {
      logPositionForm(
        '[sponsorship] Timed out waiting for sponsored bid — restarting auction'
      );
      setSponsorshipActivated(false);
      setAwaitingSponsoredBid(false);
      onTimeoutRef.current();
    }, SPONSOR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingSponsoredBid]);

  /** User clicks "Use" — activate sponsorship and request a sponsored re-quote */
  const activateSponsor = useCallback(() => {
    setSponsorshipActivated(true);
    setAwaitingSponsoredBid(true);
    onActivateRef.current();
  }, []);

  /** A sponsored bid arrived — stop blocking submission */
  const clearAwaiting = useCallback(() => {
    setAwaitingSponsoredBid(false);
  }, []);

  /** Full reset (position size change, wallet change, selections change) */
  const resetSponsor = useCallback(() => {
    setSponsorshipActivated(false);
    setAwaitingSponsoredBid(false);
  }, []);

  return {
    sponsorshipActivated,
    awaitingSponsoredBid,
    activateSponsor,
    clearAwaiting,
    resetSponsor,
  };
}
