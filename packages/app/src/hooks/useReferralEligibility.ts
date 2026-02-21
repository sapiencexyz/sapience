'use client';

import { useQuery } from '@tanstack/react-query';

interface EligibilityResponse {
  earnedInvites: number;
  usedInvites: number;
  volume: number;
  volumeFormatted: string;
  nextInviteAt: string;
}

export function useReferralEligibility(address?: string) {
  const lowerAddress = address?.toLowerCase();

  const query = useQuery({
    queryKey: ['referralEligibility', lowerAddress],
    enabled: Boolean(lowerAddress),
    staleTime: 60_000,
    queryFn: async (): Promise<EligibilityResponse> => {
      const apiUrl =
        process.env.NEXT_PUBLIC_FOIL_API_URL || 'https://api.sapience.xyz';
      const resp = await fetch(
        `${apiUrl}/referrals/eligibility?address=${lowerAddress}`
      );
      if (!resp.ok) throw new Error('Failed to fetch eligibility');
      return resp.json();
    },
  });

  const data = query.data;
  const earnedInvites = data?.earnedInvites ?? 0;
  const usedInvites = data?.usedInvites ?? 0;

  return {
    eligible: earnedInvites > usedInvites,
    earnedInvites,
    usedInvites,
    remainingInvites: Math.max(0, earnedInvites - usedInvites),
    volume: data?.volume ?? 0,
    nextInviteAt: data?.nextInviteAt ?? '10 USDe',
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
