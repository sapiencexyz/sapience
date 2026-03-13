'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import { parseAbi, type Address } from 'viem';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const SPONSOR_ADDRESS = process.env.NEXT_PUBLIC_SPONSOR_ADDRESS as
  | Address
  | undefined;

const sponsorAbi = parseAbi([
  'function remainingBudget(address) view returns (uint256)',
  'function requiredCounterparty() view returns (address)',
  'function maxEntryPriceBps() view returns (uint256)',
  'function matchLimit() view returns (uint256)',
  'function BPS() view returns (uint256)',
]);

/**
 * Read sponsorship status directly from the OnboardingSponsor contract.
 *
 * Returns budget, required counterparty, and max entry price cap — everything
 * the frontend needs to gate and display sponsored mints. No API call needed.
 */
export function useSponsorStatus() {
  const { address } = useAccount();
  const { effectiveAddress } = useSession();

  const userAddress = effectiveAddress ?? address;
  const enabled = !!userAddress && !!SPONSOR_ADDRESS;

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'remainingBudget',
        args: [userAddress!],
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'requiredCounterparty',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'maxEntryPriceBps',
        chainId: DEFAULT_CHAIN_ID,
      },
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'matchLimit',
        chainId: DEFAULT_CHAIN_ID,
      },
    ],
    query: {
      enabled,
      staleTime: 30_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const remainingBudget = (data?.[0]?.result as bigint) ?? 0n;
  const requiredCounterparty = (data?.[1]?.result as Address) ?? null;
  const maxEntryPriceBps = (data?.[2]?.result as bigint) ?? 0n;
  const matchLimit = (data?.[3]?.result as bigint) ?? 0n;

  return {
    /** Whether the user has an active sponsorship budget > 0 */
    isSponsored: remainingBudget > 0n,
    /** Sponsor contract address for MintRequest.predictorSponsor */
    sponsorAddress: SPONSOR_ADDRESS ?? null,
    /** Remaining budget in wei */
    remainingBudget,
    /** Required counterparty address (e.g. vault-bot) */
    requiredCounterparty,
    /** Max entry price in basis points (e.g. 7000 = 0.70) */
    maxEntryPriceBps,
    /** Max predictor collateral per mint in wei (0 = no limit) */
    matchLimit,
    /** Whether sponsorship is configured (env var set) */
    sponsorshipEnabled: !!SPONSOR_ADDRESS,
    /** Loading state */
    isLoading,
    /** Error state */
    error,
    /** Refetch after a mint to get updated budget */
    refetch,
  };
}

/**
 * Check all on-chain sponsorship eligibility criteria for a given bid.
 * Mirrors the checks in `OnboardingSponsor.fundMint`.
 */
export function checkSponsorEligibility(params: {
  predictorCollateral: bigint;
  counterpartyCollateral: bigint;
  bidCounterparty: string;
  requiredCounterparty: Address | null;
  maxEntryPriceBps: bigint;
  matchLimit: bigint;
  remainingBudget: bigint;
}): { eligible: boolean; reason: string | null } {
  const {
    predictorCollateral,
    counterpartyCollateral,
    bidCounterparty,
    requiredCounterparty,
    maxEntryPriceBps,
    matchLimit,
    remainingBudget,
  } = params;

  // 1. Counterparty match
  if (
    requiredCounterparty &&
    bidCounterparty.toLowerCase() !== requiredCounterparty.toLowerCase()
  ) {
    return {
      eligible: false,
      reason: 'Bid counterparty does not match the required counterparty.',
    };
  }

  // 2. Entry price cap
  if (predictorCollateral > 0n && counterpartyCollateral > 0n) {
    const total = predictorCollateral + counterpartyCollateral;
    const entryBps = (predictorCollateral * 10000n) / total;
    if (entryBps > maxEntryPriceBps) {
      return {
        eligible: false,
        reason: `Only available for positions priced below ${Number(maxEntryPriceBps) / 100}%.`,
      };
    }
  }

  // 3. Match limit
  if (matchLimit > 0n && predictorCollateral > matchLimit) {
    return {
      eligible: false,
      reason: 'Position size exceeds the sponsored match limit.',
    };
  }

  // 4. Budget sufficient
  if (predictorCollateral > 0n && predictorCollateral > remainingBudget) {
    return {
      eligible: false,
      reason: 'Sponsorship budget is insufficient for this position size.',
    };
  }

  return { eligible: true, reason: null };
}
