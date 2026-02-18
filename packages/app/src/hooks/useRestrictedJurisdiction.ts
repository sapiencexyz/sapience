'use client';

import { useSapience } from '~/lib/context/SapienceProvider';

/**
 * Shared helper for interpreting the permit/geofence state.
 *
 * - `isRestricted` is true when we have a definitive non-permitted result
 *   or when the permit query has errored (fail-safe).
 * - While `isPermitLoading` is true, callers should generally disable
 *   monetary submissions but keep existing button labels.
 */
export function useRestrictedJurisdiction() {
  const { permitData, isPermitLoading, permitError } = useSapience();

  const isRestricted =
    !isPermitLoading &&
    (permitData?.permitted === false || permitError != null);

  return {
    isRestricted,
    isPermitLoading,
    permitData,
    permitError,
  };
}
