import { useCallback, useState, useMemo } from 'react';
import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';

import { predictionMarketAbi } from '@sapience/sdk';
import { useAccount, useReadContract } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';

// Ethereal chain configuration
const CHAIN_ID_ETHEREAL = 5064014;
const WUSDE_ADDRESS = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

// WUSDe ABI for wrapping
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

interface UseSubmitPositionProps {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;
  onSuccess?: () => void;
  enabled?: boolean;
  onOrderCreated?: (
    makerNftId: bigint,
    takerNftId: bigint,
    txHash?: string
  ) => void;
  betslipData?:
    | {
        legs: Array<{ question: string; choice: 'Yes' | 'No' }>;
        wager: string;
        payout?: string;
        symbol: string;
        lastNftId?: string; // Last NFT ID before this parlay was submitted
      }
    | (() => {
        legs: Array<{ question: string; choice: 'Yes' | 'No' }>;
        wager: string;
        payout?: string;
        symbol: string;
        lastNftId?: string; // Last NFT ID before this parlay was submitted
      })
    | (() => Promise<{
        legs: Array<{ question: string; choice: 'Yes' | 'No' }>;
        wager: string;
        payout?: string;
        symbol: string;
        lastNftId?: string; // Last NFT ID before this parlay was submitted
      }>); // Can be a function (sync or async) to compute fresh data right before submission
}

export function useSubmitPosition({
  chainId,
  predictionMarketAddress,
  collateralTokenAddress,
  onSuccess,
  enabled = true,
  betslipData,
}: UseSubmitPositionProps) {
  const { address } = useAccount();

  // Read current wUSDe balance on Ethereal to avoid unnecessary wrap/deposit calls
  const { data: currentWusdeBalance } = useReadContract({
    address: WUSDE_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!address && enabled && chainId === CHAIN_ID_ETHEREAL,
    },
  });

  // Read maker nonce from PredictionMarket
  const { data: makerNonce, refetch: refetchMakerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!address && !!predictionMarketAddress && enabled,
    },
  });

  // Check current allowance to avoid unnecessary approvals
  const { data: currentAllowance } = useReadContract({
    address: collateralTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      address && predictionMarketAddress
        ? [address, predictionMarketAddress]
        : undefined,
    chainId,
    query: {
      enabled:
        !!address &&
        !!collateralTokenAddress &&
        !!predictionMarketAddress &&
        enabled,
    },
  });

  // removed debug logging

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Memoize initial share intent to prevent infinite re-renders
  // Note: This will be updated with fresh data right before submission
  // For async functions, we'll use undefined initially and update before submission
  const initialShareIntent = useMemo(() => {
    if (!betslipData) return undefined;
    if (typeof betslipData === 'function') {
      // For functions, we'll update before submission, so use undefined here
      // to avoid calling the function during render
      return undefined;
    }
    return {
      betslip: betslipData,
    };
  }, [betslipData]);

  // Use unified write/sendCalls wrapper (handles chain validation and tx monitoring)
  // Note: shareIntent will be updated right before submission to get fresh lastNftId
  const {
    sendCalls,
    isPending: isSubmitting,
    updateShareIntent,
  } = useSapienceWriteContract({
    onSuccess: () => {
      setSuccess('Position prediction minted successfully');
      setError(null);
      onSuccess?.();
    },
    onError: (err) => {
      const message = err?.message || 'Transaction failed';
      setError(message);
    },
    fallbackErrorMessage: 'Failed to submit position prediction',
    redirectPage: 'markets',
    disableSuccessToast: true,
    // Include initial betslip data in share intent (will be updated with fresh data before submission)
    shareIntent: initialShareIntent,
  });

  // Prepare calls for sendCalls
  const prepareCalls = useCallback(
    (mintData: MintPredictionRequestData) => {
      const callsArray: {
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }[] = [];

      // Parse collateral amounts
      const makerCollateralWei = BigInt(mintData.makerCollateral);
      const takerCollateralWei = BigInt(mintData.takerCollateral);

      // Validate inputs
      if (makerCollateralWei <= 0 || takerCollateralWei <= 0) {
        throw new Error('Invalid collateral amounts');
      }

      if (chainId === CHAIN_ID_ETHEREAL) {
        const wrappedBal =
          typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n;
        const amountToWrap =
          makerCollateralWei > wrappedBal
            ? makerCollateralWei - wrappedBal
            : 0n;

        // Only wrap if existing wUSDe is insufficient for the maker collateral
        if (amountToWrap > 0n) {
          const wrapCalldata = encodeFunctionData({
            abi: WUSDE_ABI,
            functionName: 'deposit',
          });

          callsArray.push({
            to: WUSDE_ADDRESS as `0x${string}`,
            data: wrapCalldata,
            value: amountToWrap,
          });
        }
      }

      // Only add approval if current allowance is insufficient
      const needsApproval =
        !currentAllowance || currentAllowance < makerCollateralWei;

      if (needsApproval) {
        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [predictionMarketAddress, makerCollateralWei],
        });

        callsArray.push({
          to: collateralTokenAddress,
          data: approveCalldata,
        });
      }

      // Convert mintData to the structure expected by the contract
      const makerNonceBigInt =
        mintData.makerNonce !== undefined
          ? BigInt(mintData.makerNonce)
          : undefined;
      if (makerNonceBigInt === undefined) {
        throw new Error('Missing maker nonce');
      }

      const mintPredictionRequestData = {
        encodedPredictedOutcomes: mintData.encodedPredictedOutcomes,
        resolver: mintData.resolver,
        makerCollateral: makerCollateralWei,
        takerCollateral: takerCollateralWei,
        maker: mintData.maker,
        taker: mintData.taker,
        makerNonce: makerNonceBigInt,
        takerSignature: mintData.takerSignature,
        takerDeadline: BigInt(mintData.takerDeadline),
        refCode: mintData.refCode,
      };

      // Add PredictionMarket.mint call
      const mintCalldata = encodeFunctionData({
        abi: predictionMarketAbi,
        functionName: 'mint',
        args: [mintPredictionRequestData],
      });

      callsArray.push({
        to: predictionMarketAddress,
        data: mintCalldata,
      });

      return callsArray;
    },
    [
      predictionMarketAddress,
      collateralTokenAddress,
      currentAllowance,
      chainId,
      currentWusdeBalance,
    ]
  );

  const submitPosition = useCallback(
    async (mintData: MintPredictionRequestData) => {
      if (!enabled || !address) {
        return;
      }

      // Prevent duplicate submissions
      if (isProcessing) {
        return;
      }

      setIsProcessing(true);
      setError(null);
      setSuccess(null);

      // Compute fresh betslip data right before submission to get latest lastNftId
      // Handle both sync and async functions
      let freshBetslipData;
      if (typeof betslipData === 'function') {
        const result = betslipData();
        freshBetslipData = result instanceof Promise ? await result : result;
      } else {
        freshBetslipData = betslipData;
      }

      // Update share intent with fresh betslip data if available
      if (freshBetslipData && updateShareIntent) {
        updateShareIntent({ betslip: freshBetslipData });
      }

      const attempt = async (forceRefetch: boolean) => {
        // Ensure we have a fresh nonce when requested
        const nonceValue = forceRefetch
          ? (await refetchMakerNonce()).data
          : makerNonce;

        if (nonceValue === undefined) {
          throw new Error('Unable to read maker nonce');
        }

        const filled: MintPredictionRequestData = {
          ...mintData,
          makerNonce: nonceValue as unknown as bigint,
        };
        const calls = prepareCalls(filled);
        if (calls.length === 0) {
          throw new Error('No valid calls to execute');
        }

        await sendCalls({
          calls,
          chainId,
        });
      };

      try {
        // Validate mint data
        if (!mintData) {
          throw new Error('No mint data provided');
        }

        // First attempt with current cached nonce
        await attempt(false);
        setIsProcessing(false);
      } catch (err: any) {
        const msg = (err?.message || '').toString();
        const isNonceErr = msg.includes('InvalidMakerNonce');
        if (isNonceErr) {
          try {
            // One-time retry with fresh nonce
            await attempt(true);
            setIsProcessing(false);
            return;
          } catch (retryErr: any) {
            const retryMsg = (retryErr?.message || '').toString();
            setError(
              retryMsg || 'Failed to submit position prediction after retry'
            );
            setIsProcessing(false);
            return;
          }
        }
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to submit position prediction';
        setError(errorMessage);
        setIsProcessing(false);
      }
    },
    [
      enabled,
      address,
      chainId,
      prepareCalls,
      sendCalls,
      makerNonce,
      refetchMakerNonce,
      isProcessing,
      betslipData,
      updateShareIntent,
    ]
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    submitPosition,
    isSubmitting,
    error,
    success,
    reset,
  };
}
