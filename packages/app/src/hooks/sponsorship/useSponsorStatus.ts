'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import type { Address } from 'viem';

interface SponsorStatus {
  /** Whether sponsorship is configured on the API */
  enabled: boolean;
  /** OnboardingSponsor contract address (to pass as predictorSponsor in MintRequest) */
  sponsorAddress: Address | null;
  /** Remaining budget in wei (collateral token, 18 decimals) */
  remainingBudget: bigint;
}

async function fetchSponsorStatus(
  address: string
): Promise<SponsorStatus> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const res = await fetch(
    `${apiUrl}/referrals/sponsor-status?address=${encodeURIComponent(address)}`
  );

  if (!res.ok) {
    return { enabled: false, sponsorAddress: null, remainingBudget: 0n };
  }

  const data = await res.json();

  return {
    enabled: data.enabled ?? false,
    sponsorAddress: data.sponsorAddress ?? null,
    remainingBudget: BigInt(data.remainingBudget || '0'),
  };
}

/**
 * Check if the connected user has a sponsorship budget for their first prediction.
 *
 * When `isSponsored` is true, the create position form should:
 * 1. Pass `sponsorAddress` as `predictorSponsor` in the MintRequest
 * 2. Skip the collateral approval step (sponsor funds the predictor side)
 * 3. Show UI indicating the prediction is sponsored
 */
export function useSponsorStatus() {
  const { address } = useAccount();
  const { effectiveAddress } = useSession();

  const userAddress = effectiveAddress ?? address;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sponsor-status', userAddress],
    queryFn: () => fetchSponsorStatus(userAddress!),
    enabled: !!userAddress,
    staleTime: 30_000, // 30s — budget can change after a mint
    refetchOnWindowFocus: true,
  });

  return {
    /** Whether the user has an active sponsorship budget > 0 */
    isSponsored: (data?.remainingBudget ?? 0n) > 0n,
    /** Sponsor contract address for MintRequest.predictorSponsor */
    sponsorAddress: data?.sponsorAddress ?? null,
    /** Remaining budget in wei */
    remainingBudget: data?.remainingBudget ?? 0n,
    /** Whether sponsorship is configured server-side */
    sponsorshipEnabled: data?.enabled ?? false,
    /** Loading state */
    isLoading,
    /** Error state */
    error,
    /** Refetch after a mint to get updated budget */
    refetch,
  };
}
