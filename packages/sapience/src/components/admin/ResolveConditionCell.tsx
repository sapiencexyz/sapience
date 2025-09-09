'use client';

import { Button } from '@sapience/ui/components/ui/button';
import { useWallets } from '@privy-io/react-auth';
import { Loader2 } from 'lucide-react';
import { erc20Abi, zeroAddress } from 'viem';
import { useReadContract } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

type ResolveConditionCellProps = {
  marketId?: `0x${string}`;
  endTime?: number;
  className?: string;
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
      { internalType: 'bytes32', name: 'marketId', type: 'bytes32' },
      { internalType: 'bool', name: 'resolvedToYes', type: 'bool' },
    ],
    name: 'submitAssertion',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

const ResolveConditionCell = ({
  marketId,
  endTime,
  className,
}: ResolveConditionCellProps) => {
  const { wallets } = useWallets();
  const connectedAddress = (wallets?.[0]?.address || undefined) as
    | `0x${string}`
    | undefined;

  // Defaults to Arbitrum + provided UMA resolver address if env vars are not set
  const DEFAULT_UMA_RESOLVER_ADDRESS =
    '0xFD2b0F02AC23e0dccfc922E77eAc7f9510B25323' as `0x${string}`;
  const DEFAULT_UMA_CHAIN_ID = 42161;

  const envUmaAddress = process.env.NEXT_PUBLIC_UMA_RESOLVER_ADDRESS as
    | `0x${string}`
    | undefined;
  const envUmaChain = process.env.NEXT_PUBLIC_UMA_CHAIN_ID
    ? Number(process.env.NEXT_PUBLIC_UMA_CHAIN_ID)
    : undefined;

  const UMA_RESOLVER_ADDRESS =
    envUmaAddress && envUmaAddress.startsWith('0x')
      ? envUmaAddress
      : DEFAULT_UMA_RESOLVER_ADDRESS;
  const UMA_CHAIN_ID = Number.isFinite(envUmaChain)
    ? (envUmaChain as number)
    : DEFAULT_UMA_CHAIN_ID;

  const nowSec = Math.floor(Date.now() / 1000);
  const pastEnd = !!endTime && nowSec >= endTime;
  const umaConfigured = Boolean(UMA_RESOLVER_ADDRESS && UMA_CHAIN_ID);

  const { data: umaConfig } = useReadContract({
    address: UMA_RESOLVER_ADDRESS,
    abi: umaResolverAbi,
    functionName: 'config',
    chainId: UMA_CHAIN_ID,
    query: { enabled: Boolean(UMA_RESOLVER_ADDRESS && UMA_CHAIN_ID) },
  });

  const bondCurrency = umaConfig?.[2] || zeroAddress;
  const bondAmount = umaConfig?.[3] || 0n;

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
      successMessage: 'Assertion submitted',
      fallbackErrorMessage: 'Submit failed',
    });

  const disabledButtons =
    !pastEnd ||
    !umaConfigured ||
    !marketId ||
    !connectedAddress ||
    isSubmitting ||
    requiresApproval;

  return (
    <div
      className={['flex items-center gap-2', className || ''].join(' ').trim()}
    >
      {umaConfigured && connectedAddress && requiresApproval ? (
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
          if (!UMA_CHAIN_ID || !UMA_RESOLVER_ADDRESS || !marketId) return;
          submitWrite({
            address: UMA_RESOLVER_ADDRESS,
            abi: umaResolverAbi,
            functionName: 'submitAssertion',
            args: [marketId, true],
            chainId: UMA_CHAIN_ID,
          });
        }}
        disabled={disabledButtons}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Yes
          </>
        ) : (
          'Resolve Yes'
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!UMA_CHAIN_ID || !UMA_RESOLVER_ADDRESS || !marketId) return;
          submitWrite({
            address: UMA_RESOLVER_ADDRESS,
            abi: umaResolverAbi,
            functionName: 'submitAssertion',
            args: [marketId, false],
            chainId: UMA_CHAIN_ID,
          });
        }}
        disabled={disabledButtons}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-3 w-3 animate-spin" /> No
          </>
        ) : (
          'Resolve No'
        )}
      </Button>
    </div>
  );
};

export default ResolveConditionCell;
