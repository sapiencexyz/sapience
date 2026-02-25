'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import { parseAbi, type Address } from 'viem';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';

const SPONSOR_ADDRESS = process.env
  .NEXT_PUBLIC_SPONSOR_ADDRESS as Address | undefined;

const sponsorAbi = parseAbi([
  'function remainingBudget(address) view returns (uint256)',
  'function requiredCounterparty() view returns (address)',
  'function maxEntryPriceBps() view returns (uint256)',
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
        chainId: CHAIN_ID_ETHEREAL_TESTNET,
      },
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'requiredCounterparty',
        chainId: CHAIN_ID_ETHEREAL_TESTNET,
      },
      {
        address: SPONSOR_ADDRESS!,
        abi: sponsorAbi,
        functionName: 'maxEntryPriceBps',
        chainId: CHAIN_ID_ETHEREAL_TESTNET,
      },
    ],
    query: {
      enabled,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  });

  const remainingBudget = (data?.[0]?.result as bigint) ?? 0n;
  const requiredCounterparty =
    (data?.[1]?.result as Address) ?? null;
  const maxEntryPriceBps = (data?.[2]?.result as bigint) ?? 0n;

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
 * Check whether a given entry price qualifies for sponsorship.
 * @param predictorCollateral - predictor's collateral amount
 * @param counterpartyCollateral - counterparty's collateral amount
 * @param maxBps - max entry price in basis points from the contract
 * @returns true if the entry price is at or below the cap
 */
export function isEntryPriceEligible(
  predictorCollateral: bigint,
  counterpartyCollateral: bigint,
  maxBps: bigint
): boolean {
  if (predictorCollateral === 0n || counterpartyCollateral === 0n) return false;
  const total = predictorCollateral + counterpartyCollateral;
  const entryBps = (predictorCollateral * 10000n) / total;
  return entryBps <= maxBps;
}
