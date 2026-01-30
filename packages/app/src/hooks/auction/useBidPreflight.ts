'use client';

import { useCallback, useMemo } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { formatUnits } from 'viem';
import { predictionMarket, predictionMarketEscrow, collateralToken } from '@sapience/sdk/contracts';
import { predictionMarketAbi } from '@sapience/sdk';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import { CHAIN_ID_ETHEREAL_TESTNET } from '@sapience/sdk/constants';
import { useChainValidation } from '~/hooks/blockchain/useChainValidation';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';

type PreflightBlockedReason =
  | 'chain_switch_failed'
  | 'insufficient_balance'
  | 'insufficient_allowance'
  | 'wallet_not_connected'
  | null;

type PreflightResult = {
  canProceed: boolean;
  blockedReason: PreflightBlockedReason;
  details?: {
    requiredAmount?: number;
    balanceValue?: number;
    allowanceValue?: number;
    message?: string;
  };
};

interface UseBidPreflightOptions {
  onError?: (error: string) => void;
  onLoading?: (loading: boolean) => void;
}

interface UseBidPreflightResult {
  /** Current balance value (human-readable) */
  balanceValue: number;
  /** Current allowance value (human-readable) */
  allowanceValue: number;
  /** Token decimals */
  tokenDecimals: number;
  /** Collateral token symbol */
  collateralSymbol: string;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Refetch balance and allowance */
  refetch: () => void;
  /**
   * Run preflight validation for a bid.
   * Returns { canProceed, blockedReason, details }.
   * Performs chain switch if needed, then validates balance and allowance.
   */
  runPreflight: (requiredAmount: number) => Promise<PreflightResult>;
  /**
   * Synchronous check of balance and allowance without chain switching.
   * Useful for display/UI state without triggering wallet actions.
   */
  checkReadiness: (requiredAmount: number) => PreflightResult;
}

export function useBidPreflight(
  options: UseBidPreflightOptions = {}
): UseBidPreflightResult {
  const { onError, onLoading } = options;
  const { address } = useAccount();
  // TODO: Get chainId from context/props when supporting multiple chains
  const chainId = CHAIN_ID_ETHEREAL_TESTNET;

  const {
    balance,
    symbol: collateralSymbol,
    decimals: tokenDecimals,
    isLoading: isBalanceLoading,
    refetch: refetchBalance,
  } = useCollateralBalance({
    address,
    chainId,
    enabled: Boolean(address),
  });

  const { validateAndSwitchChain } = useChainValidation({
    onError,
    onLoading,
  });

  // Get spender address for the current chain
  // V2 (testnet) uses PredictionMarketEscrow, V1 (mainnet) uses PredictionMarket
  const isV2Chain = chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const SPENDER_ADDRESS = (isV2Chain
    ? predictionMarketEscrow[chainId]?.address
    : predictionMarket[chainId]?.address) as `0x${string}` | undefined;

  // For V2, use collateral token address directly from SDK
  // For V1, read from PredictionMarket contract config
  const V2_COLLATERAL_ADDRESS = isV2Chain
    ? (collateralToken[chainId]?.address as `0x${string}` | undefined)
    : undefined;

  // Read collateral token address from PredictionMarket contract config (V1 only)
  const predictionMarketConfigRead = useReadContracts({
    contracts: !isV2Chain && SPENDER_ADDRESS
      ? [
          {
            address: SPENDER_ADDRESS,
            abi: predictionMarketAbi,
            functionName: 'getConfig',
            chainId: chainId,
          },
        ]
      : [],
    query: { enabled: !isV2Chain && !!SPENDER_ADDRESS },
  });

  const COLLATERAL_ADDRESS: `0x${string}` | undefined = useMemo(() => {
    // For V2, use SDK address directly
    if (isV2Chain) return V2_COLLATERAL_ADDRESS;
    // For V1, use config read
    const item = predictionMarketConfigRead.data?.[0];
    if (item && item.status === 'success') {
      const cfg = item.result as { collateralToken: `0x${string}` };
      return cfg?.collateralToken;
    }
    return undefined;
  }, [isV2Chain, V2_COLLATERAL_ADDRESS, predictionMarketConfigRead.data]);

  // Read allowance for connected address -> PredictionMarket
  const allowanceRead = useReadContracts({
    contracts:
      address && COLLATERAL_ADDRESS && SPENDER_ADDRESS
        ? [
            {
              address: COLLATERAL_ADDRESS,
              abi: erc20Abi as any,
              functionName: 'allowance',
              args: [address, SPENDER_ADDRESS],
              chainId: chainId,
            },
          ]
        : [],
    query: {
      enabled: Boolean(address && COLLATERAL_ADDRESS && SPENDER_ADDRESS),
    },
  });

  const allowanceValue = useMemo(() => {
    try {
      const item = allowanceRead.data?.[0];
      if (item && item.status === 'success') {
        const raw = item.result as bigint;
        return Number(formatUnits(raw, tokenDecimals));
      }
      return 0;
    } catch {
      return 0;
    }
  }, [allowanceRead.data, tokenDecimals]);

  const isLoading =
    isBalanceLoading ||
    (!isV2Chain && predictionMarketConfigRead.isLoading) ||
    allowanceRead.isLoading;

  const refetch = useCallback(() => {
    refetchBalance();
    allowanceRead.refetch();
  }, [refetchBalance, allowanceRead]);

  /**
   * Synchronous check of balance and allowance without chain switching.
   */
  const checkReadiness = useCallback(
    (requiredAmount: number): PreflightResult => {
      if (!address) {
        return {
          canProceed: false,
          blockedReason: 'wallet_not_connected',
          details: { message: 'Wallet not connected' },
        };
      }

      // Check balance first (prioritize over allowance)
      const insufficientBalance =
        requiredAmount > 0 ? balance < requiredAmount : balance <= 0;

      if (insufficientBalance) {
        return {
          canProceed: false,
          blockedReason: 'insufficient_balance',
          details: {
            requiredAmount,
            balanceValue: balance,
            message: 'Insufficient account balance',
          },
        };
      }

      // Check allowance
      const insufficientAllowance =
        requiredAmount > 0
          ? allowanceValue < requiredAmount
          : allowanceValue <= 0;

      if (insufficientAllowance) {
        return {
          canProceed: false,
          blockedReason: 'insufficient_allowance',
          details: {
            requiredAmount,
            allowanceValue,
            message: 'Insufficient spend approved',
          },
        };
      }

      return {
        canProceed: true,
        blockedReason: null,
      };
    },
    [address, balance, allowanceValue]
  );

  /**
   * Run full preflight validation including chain switch.
   */
  const runPreflight = useCallback(
    async (requiredAmount: number): Promise<PreflightResult> => {
      if (!address) {
        return {
          canProceed: false,
          blockedReason: 'wallet_not_connected',
          details: { message: 'Wallet not connected' },
        };
      }

      // 1. Switch chain first
      try {
        await validateAndSwitchChain(chainId);
      } catch (error) {
        return {
          canProceed: false,
          blockedReason: 'chain_switch_failed',
          details: {
            message:
              error instanceof Error ? error.message : 'Failed to switch chain',
          },
        };
      }

      // 2. Check balance (prioritize over allowance)
      const insufficientBalance =
        requiredAmount > 0 ? balance < requiredAmount : balance <= 0;

      if (insufficientBalance) {
        return {
          canProceed: false,
          blockedReason: 'insufficient_balance',
          details: {
            requiredAmount,
            balanceValue: balance,
            message: 'Insufficient account balance',
          },
        };
      }

      // 3. Check allowance
      const insufficientAllowance =
        requiredAmount > 0
          ? allowanceValue < requiredAmount
          : allowanceValue <= 0;

      if (insufficientAllowance) {
        return {
          canProceed: false,
          blockedReason: 'insufficient_allowance',
          details: {
            requiredAmount,
            allowanceValue,
            message: 'Insufficient spend approved',
          },
        };
      }

      return {
        canProceed: true,
        blockedReason: null,
      };
    },
    [address, chainId, balance, allowanceValue, validateAndSwitchChain]
  );

  return {
    balanceValue: balance,
    allowanceValue,
    tokenDecimals,
    collateralSymbol,
    isLoading,
    refetch,
    runPreflight,
    checkReadiness,
  };
}
