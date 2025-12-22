'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { useWallets } from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';
import { erc20Abi, zeroAddress, toHex, keccak256, concatHex } from 'viem';
import { useReadContract, useWriteContract, useSwitchChain } from 'wagmi';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useToast } from '@sapience/ui/hooks/use-toast';
import { getAdminSettlementTarget } from '~/lib/resolvers/conditionResolver';

type ResolveConditionCellProps = {
  marketId?: `0x${string}`;
  endTime?: number;
  claim?: string;
  className?: string;
  assertionId?: string;
  assertionTimestamp?: number;
  resolver?: string | null;
};

const umaResolverAbi = [
  {
    inputs: [],
    name: 'config',
    outputs: [
      {
        internalType: 'uint256',
        name: 'maxPredictionMarkets',
        type: 'uint256',
      },
      { internalType: 'address', name: 'optimisticOracleV3', type: 'address' },
      { internalType: 'address', name: 'bondCurrency', type: 'address' },
      { internalType: 'uint256', name: 'bondAmount', type: 'uint256' },
      { internalType: 'uint64', name: 'assertionLiveness', type: 'uint64' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes', name: 'claim', type: 'bytes' },
      { internalType: 'uint256', name: 'endTime', type: 'uint256' },
      { internalType: 'bool', name: 'resolvedToYes', type: 'bool' },
    ],
    name: 'submitAssertion',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'marketId', type: 'bytes32' }],
    name: 'getMarketAssertionId',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const optimisticOracleV3Abi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'assertionId', type: 'bytes32' }],
    name: 'settleAssertion',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ResolveConditionCell = ({
  endTime,
  claim,
  className,
  assertionId: propAssertionId,
  assertionTimestamp,
  resolver,
}: ResolveConditionCellProps) => {
  const { wallets } = useWallets();
  const connectedAddress = (wallets?.[0]?.address || undefined) as
    | `0x${string}`
    | undefined;

  const adminTarget =
    getAdminSettlementTarget({ conditionResolver: resolver }) ?? null;
  const UMA_CHAIN_ID = adminTarget?.chainId ?? DEFAULT_CHAIN_ID;
  const UMA_RESOLVER_ADDRESS = adminTarget?.resolverAddress;

  const nowSec = Math.floor(Date.now() / 1000);
  const pastEnd = !!endTime && nowSec >= endTime;
  const umaConfigured = Boolean(UMA_RESOLVER_ADDRESS && UMA_CHAIN_ID);

  let marketId: `0x${string}` | undefined;
  try {
    if (claim && endTime) {
      const claimHex = toHex(claim);
      const colonHex = toHex(':');
      const endTimeHex = toHex(BigInt(endTime), { size: 32 });
      const packed = concatHex([claimHex, colonHex, endTimeHex]);
      marketId = keccak256(packed);
    }
  } catch {
    marketId = undefined;
  }

  const { data: umaConfig } = useReadContract({
    address: UMA_RESOLVER_ADDRESS,
    abi: umaResolverAbi,
    functionName: 'config',
    chainId: UMA_CHAIN_ID,
    query: { enabled: Boolean(UMA_RESOLVER_ADDRESS && UMA_CHAIN_ID) },
  });

  const bondCurrency = umaConfig?.[2] || zeroAddress;
  const bondAmount = umaConfig?.[3] || 0n;

  const OPTIMISTIC_ORACLE_V3_ADDRESS =
    '0xa6147867264374F324524E30C02C331cF28aa879' as `0x${string}`;
  const optimisticOracleV3 = umaConfig?.[1] || OPTIMISTIC_ORACLE_V3_ADDRESS;
  const ASSERTION_LIVENESS_SECONDS = 600;

  const { data: contractAssertionId, refetch: refetchAssertionId } =
    useReadContract({
      address: UMA_RESOLVER_ADDRESS,
      abi: umaResolverAbi,
      functionName: 'getMarketAssertionId',
      args: marketId ? [marketId] : undefined,
      chainId: UMA_CHAIN_ID,
      query: { enabled: Boolean(marketId && UMA_RESOLVER_ADDRESS) },
    });

  const assertionId = (propAssertionId as `0x${string}`) || contractAssertionId;

  const assertionSubmitted =
    !!assertionId &&
    assertionId !==
      '0x0000000000000000000000000000000000000000000000000000000000000000';

  // Calculate expiration time: assertionTimestamp + liveness period
  const expirationTime =
    assertionTimestamp !== undefined
      ? assertionTimestamp + ASSERTION_LIVENESS_SECONDS
      : undefined;

  const livenessPassed =
    expirationTime !== undefined &&
    Math.floor(Date.now() / 1000) >= expirationTime;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20Abi,
    address: bondCurrency,
    functionName: 'allowance',
    args: [
      connectedAddress || zeroAddress,
      UMA_RESOLVER_ADDRESS || zeroAddress,
    ],
    chainId: UMA_CHAIN_ID,
    query: {
      enabled:
        Boolean(UMA_RESOLVER_ADDRESS && UMA_CHAIN_ID) &&
        Boolean(connectedAddress) &&
        Boolean(bondCurrency && bondCurrency !== zeroAddress),
    },
  });

  const requiresApproval =
    typeof allowance !== 'undefined' && typeof bondAmount !== 'undefined'
      ? allowance < bondAmount
      : false;

  const { writeContract: approveWrite, isPending: isApproving } =
    useSapienceWriteContract({
      onSuccess: () => setTimeout(() => refetchAllowance(), 2500),
      successMessage: 'Bond approved',
      fallbackErrorMessage: 'Approval failed',
    });

  const { writeContract: submitWrite, isPending: isSubmitting } =
    useSapienceWriteContract({
      onSuccess: () => setTimeout(() => refetchAssertionId(), 2500),
      successMessage: 'Assertion submitted',
      fallbackErrorMessage: 'Submit failed',
    });

  const { toast } = useToast();
  const { switchChainAsync } = useSwitchChain();

  const { writeContractAsync: settleWriteAsync, isPending: isSettling } =
    useWriteContract();

  const disabledButtons =
    !pastEnd ||
    !umaConfigured ||
    !(claim && endTime) ||
    !connectedAddress ||
    isSubmitting ||
    requiresApproval ||
    assertionSubmitted;

  const canSettle = assertionSubmitted && assertionId;

  return (
    <div
      className={['flex items-center gap-2', className || ''].join(' ').trim()}
    >
      {canSettle ? (
        <Button
          size="sm"
          onClick={async () => {
            if (!optimisticOracleV3 || !assertionId) return;
            try {
              // Switch to Arbitrum if needed
              await switchChainAsync({ chainId: UMA_CHAIN_ID });

              const hash = await settleWriteAsync({
                address: optimisticOracleV3,
                abi: optimisticOracleV3Abi,
                functionName: 'settleAssertion',
                args: [assertionId],
                chainId: UMA_CHAIN_ID,
              });

              toast({
                title: 'Transaction Submitted',
                description: `Settlement transaction sent. Hash: ${hash.slice(0, 10)}... Refresh the page in a few moments to see the updated status.`,
                duration: 10000,
              });

              // Refetch after a delay
              setTimeout(() => refetchAssertionId(), 5000);
            } catch (error) {
              console.error('Settlement error:', error);
              toast({
                title: 'Settlement Error',
                description:
                  (error as Error)?.message || 'Failed to settle assertion',
                variant: 'destructive',
                duration: 5000,
              });
            }
          }}
          disabled={isSettling || !livenessPassed}
          title={
            !livenessPassed && expirationTime
              ? `Available at ${new Date(expirationTime * 1000).toLocaleTimeString()}`
              : undefined
          }
        >
          {isSettling ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Settling
            </>
          ) : (
            'Settle Assertion'
          )}
        </Button>
      ) : (
        <>
          {umaConfigured &&
          connectedAddress &&
          requiresApproval &&
          !assertionSubmitted ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!UMA_CHAIN_ID || !UMA_RESOLVER_ADDRESS) return;
                if (!bondCurrency || !bondAmount) return;
                approveWrite({
                  abi: erc20Abi,
                  address: bondCurrency,
                  functionName: 'approve',
                  args: [UMA_RESOLVER_ADDRESS, bondAmount],
                  chainId: UMA_CHAIN_ID,
                });
              }}
              disabled={isApproving}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Approving
                </>
              ) : (
                'Approve Bond'
              )}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              if (!UMA_CHAIN_ID || !UMA_RESOLVER_ADDRESS || !claim || !endTime)
                return;
              submitWrite({
                address: UMA_RESOLVER_ADDRESS,
                abi: umaResolverAbi,
                functionName: 'submitAssertion',
                args: [toHex(claim), BigInt(endTime), true],
                chainId: UMA_CHAIN_ID,
              });
            }}
            disabled={disabledButtons}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Yes
              </>
            ) : assertionSubmitted ? (
              'Asserted'
            ) : (
              'Resolve Yes'
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!UMA_CHAIN_ID || !UMA_RESOLVER_ADDRESS || !claim || !endTime)
                return;
              submitWrite({
                address: UMA_RESOLVER_ADDRESS,
                abi: umaResolverAbi,
                functionName: 'submitAssertion',
                args: [toHex(claim), BigInt(endTime), false],
                chainId: UMA_CHAIN_ID,
              });
            }}
            disabled={disabledButtons}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" /> No
              </>
            ) : assertionSubmitted ? (
              'Asserted'
            ) : (
              'Resolve No'
            )}
          </Button>
        </>
      )}
    </div>
  );
};

export default ResolveConditionCell;
