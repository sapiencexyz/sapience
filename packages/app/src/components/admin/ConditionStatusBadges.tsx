'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import { useReadContract } from 'wagmi';
import { pythConditionResolver } from '@sapience/sdk/contracts';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const WRAPPED_MARKETS_ABI = [
  {
    inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    name: 'wrappedMarkets',
    outputs: [
      { internalType: 'bytes32', name: 'marketId', type: 'bytes32' },
      { internalType: 'bool', name: 'assertionSubmitted', type: 'bool' },
      { internalType: 'bool', name: 'settled', type: 'bool' },
      { internalType: 'bool', name: 'resolvedToYes', type: 'bool' },
      { internalType: 'bytes32', name: 'assertionId', type: 'bytes32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

interface ConditionStatusBadgesProps {
  conditionId?: string;
  endTime?: number;
  // When provided, short-circuits the on-chain lookup.
  isSettledOverride?: boolean;
  chainId?: number;
  resolver?: string | null;
}

export function ConditionStatusBadges({
  conditionId,
  endTime,
  isSettledOverride,
  chainId,
  resolver,
}: ConditionStatusBadgesProps) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isUpcoming = (endTime ?? 0) > nowSeconds;
  const isPastEnd = !!endTime && endTime <= nowSeconds;

  const marketId = conditionId as `0x${string}` | undefined;

  const targetChainId = chainId || DEFAULT_CHAIN_ID;
  const address =
    (resolver as `0x${string}` | undefined) ??
    pythConditionResolver[targetChainId]?.address;

  const { data } = useReadContract({
    address,
    abi: WRAPPED_MARKETS_ABI,
    functionName: 'wrappedMarkets',
    args: marketId ? [marketId] : undefined,
    chainId: targetChainId,
    query: { enabled: Boolean(marketId) && isSettledOverride === undefined },
  });

  const tuple = data;
  const settled = isSettledOverride ?? Boolean(tuple?.[2] ?? false);

  return (
    <div className="flex flex-col items-start gap-1">
      {isPastEnd && settled ? (
        <Badge variant="outline" className="whitespace-nowrap">
          Settled
        </Badge>
      ) : null}
      {isPastEnd && !settled ? (
        <Badge variant="destructive" className="whitespace-nowrap">
          Needs Settlement
        </Badge>
      ) : null}
      {isUpcoming ? (
        <Badge variant="secondary" className="whitespace-nowrap">
          Upcoming
        </Badge>
      ) : null}
    </div>
  );
}
