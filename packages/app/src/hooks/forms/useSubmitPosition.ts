/**
 * Position submission hook supporting both V1 (mainnet) and V2 (testnet) protocols.
 * V1: Uses SignatureProcessor.Approve, predictor signs upfront
 * V2: Uses MintApproval EIP-712, predictor signs at accept time
 */
import { useCallback, useState, useMemo } from 'react';
import { encodeFunctionData, erc20Abi, parseAbi, type Address } from 'viem';

import { predictionMarketAbi, predictionMarketEscrowAbi } from '@sapience/sdk';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { predictionMarketEscrow } from '@sapience/sdk/contracts';
import { buildPredictorMintTypedData } from '@sapience/sdk/auction/v2Signing';
import { canonicalizePicks } from '@sapience/sdk/auction/v2Encoding';
import type { Pick } from '@sapience/sdk/types/v2';
import { useAccount, useReadContract, useSignTypedData } from 'wagmi';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { useSession } from '~/lib/context/SessionContext';
import { encodeV2SessionKeyData, verifyAccountFactoryMapping } from '~/lib/session/sessionKeyManager';
import type { MintPredictionRequestData } from '~/lib/auction/useAuctionStart';
import { getPublicClientForChainId } from '~/lib/utils/util';
import { useV2Nonce } from '~/hooks/blockchain/useV2Contract';
import {
  decodeAuctionPredictedOutcomes,
  decodedOutcomesToV2Picks,
} from '~/lib/auction/decodePredictedOutcomes';

// WUSDe addresses per chain
const WUSDE_ADDRESSES: Record<number, `0x${string}`> = {
  [CHAIN_ID_ETHEREAL]: '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D',
  [CHAIN_ID_ETHEREAL_TESTNET]: '0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90',
};

// Helper to check if chain is Ethereal (mainnet or testnet)
const isEtherealChain = (chainId: number) =>
  chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;

function toBigIntSafe(
  value: string | number | bigint | undefined
): bigint | undefined {
  if (value === undefined) return undefined;
  return BigInt(value);
}

async function validateTakerFunds(
  takerAddress: `0x${string}` | undefined,
  takerCollateralWei: bigint,
  collateralTokenAddress: `0x${string}`,
  predictionMarketAddress: `0x${string}`,
  publicClient: ReturnType<typeof getPublicClientForChainId>
): Promise<void> {
  if (!takerAddress || !collateralTokenAddress || !predictionMarketAddress) {
    return;
  }

  try {
    const [takerAllowance, takerBalance] = await Promise.all([
      publicClient.readContract({
        address: collateralTokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [takerAddress, predictionMarketAddress],
      }),
      publicClient.readContract({
        address: collateralTokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [takerAddress],
      }),
    ]);

    if (
      takerAllowance < takerCollateralWei ||
      takerBalance < takerCollateralWei
    ) {
      throw new Error(
        'This bid is no longer valid. The market maker has insufficient funds. Please request new bids.'
      );
    }
  } catch (e) {
    // Re-throw our own error, only catch RPC failures
    if (e instanceof Error && e.message.includes('market maker')) {
      throw e;
    }
    // Silently continue on RPC failures
  }
}

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
  onProgressUpdate?: {
    onTxSending?: () => void;
    onTxSent?: (txHash: string) => void;
    onReceiptConfirmed?: () => void;
  };
}

export function useSubmitPosition({
  chainId,
  predictionMarketAddress,
  collateralTokenAddress,
  onSuccess,
  enabled = true,
  onProgressUpdate,
}: UseSubmitPositionProps) {
  const { address } = useAccount();
  const { effectiveAddress, signTypedData: sessionSignTypedData, isUsingSession, v2SessionKeyApproval } = useSession();
  const { signTypedDataAsync } = useSignTypedData();

  // V2 chain detection
  const isV2Chain = chainId === CHAIN_ID_ETHEREAL_TESTNET;
  const v2EscrowAddress = isV2Chain
    ? (predictionMarketEscrow[chainId]?.address as `0x${string}` | undefined)
    : undefined;

  // For V2, use the escrow contract; for V1, use the prediction market
  const targetContractAddress =
    isV2Chain && v2EscrowAddress ? v2EscrowAddress : predictionMarketAddress;

  // Get WUSDe address for this chain
  const wusdeAddress = WUSDE_ADDRESSES[chainId];

  // Read current wUSDe balance on Ethereal chains to avoid unnecessary wrap/deposit calls
  const { data: currentWusdeBalance } = useReadContract({
    address: wusdeAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: {
      enabled:
        !!effectiveAddress &&
        enabled &&
        isEtherealChain(chainId) &&
        !!wusdeAddress,
    },
  });

  // V2: Get predictor nonce from PredictionMarketEscrow
  const { nonce: v2Nonce, refetch: refetchV2Nonce } = useV2Nonce({
    address: effectiveAddress as Address | undefined,
    chainId,
    enabled: isV2Chain && enabled,
  });

  // V1: Read maker nonce from PredictionMarket
  const { data: makerNonce, refetch: refetchMakerNonce } = useReadContract({
    address: predictionMarketAddress,
    abi: predictionMarketAbi,
    functionName: 'nonces',
    args: effectiveAddress ? [effectiveAddress] : undefined,
    chainId,
    query: {
      enabled:
        !!effectiveAddress &&
        !!predictionMarketAddress &&
        enabled &&
        !isV2Chain,
    },
  });

  // Check current allowance to avoid unnecessary approvals
  // Use targetContractAddress (V2 escrow or V1 prediction market)
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract(
    {
      address: collateralTokenAddress,
      abi: erc20Abi,
      functionName: 'allowance',
      args:
        effectiveAddress && targetContractAddress
          ? [effectiveAddress, targetContractAddress]
          : undefined,
      chainId,
      query: {
        enabled:
          !!effectiveAddress &&
          !!collateralTokenAddress &&
          !!targetContractAddress &&
          enabled,
      },
    }
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Memoized public client for third-party validation (market maker checks)
  // This is used to validate external addresses, not the user's own state
  const publicClient = useMemo(
    () => getPublicClientForChainId(chainId),
    [chainId]
  );

  // Use unified write/sendCalls wrapper (handles chain validation and tx monitoring)
  // Note: Share dialog is handled locally in CreatePositionForm, no redirect needed
  const { sendCalls, isPending: isSubmitting } = useSapienceWriteContract({
    onSuccess: () => {
      setSuccess('Position prediction minted successfully');
      setError(null);
      onSuccess?.();
    },
    onError: (err) => {
      const message = err?.message || 'Transaction failed';
      setError(message);
    },
    onTxHash: (txHash) => {
      // Called for non-session transactions (legacy path)
      onProgressUpdate?.onTxSent?.(txHash);
    },
    onTxSent: (txHash) => {
      // Called for session transactions when bundler accepts user op
      onProgressUpdate?.onTxSent?.(txHash);
    },
    onTxSending: onProgressUpdate?.onTxSending,
    onReceiptConfirmed: onProgressUpdate?.onReceiptConfirmed,
    fallbackErrorMessage: 'Failed to submit position prediction',
    disableSuccessToast: true,
  });

  // Prepare calls for sendCalls - combines wrap + approval + mint in a single batch
  // V1 version - used for mainnet
  const prepareV1Calls = useCallback(
    (mintData: MintPredictionRequestData, freshAllowance?: bigint) => {
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

      if (isEtherealChain(chainId) && wusdeAddress) {
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
            to: wusdeAddress,
            data: wrapCalldata,
            value: amountToWrap,
          });
        }
      }

      // Use fresh allowance if provided (from direct RPC), otherwise fall back to cached
      const effectiveAllowance = freshAllowance ?? currentAllowance;
      const needsApproval =
        effectiveAllowance === undefined ||
        effectiveAllowance < makerCollateralWei;

      // Add approval call if needed (batched with mint)
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

      // Convert mintData to the structure expected by the V1 contract
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
      wusdeAddress,
    ]
  );

  // V2 version - used for testnet with PredictionMarketEscrow
  const prepareV2Calls = useCallback(
    (params: {
      mintRequest: {
        picks: Array<{
          conditionResolver: Address;
          conditionId: `0x${string}`;
          predictedOutcome: number;
        }>;
        predictorWager: bigint;
        counterpartyWager: bigint;
        predictor: Address;
        counterparty: Address;
        predictorNonce: bigint;
        counterpartyNonce: bigint;
        predictorDeadline: bigint;
        counterpartyDeadline: bigint;
        predictorSignature: `0x${string}`;
        counterpartySignature: `0x${string}`;
        refCode: `0x${string}`;
        predictorSessionKeyData: `0x${string}`;
        counterpartySessionKeyData: `0x${string}`;
      };
      freshAllowance?: bigint;
    }) => {
      const { mintRequest, freshAllowance } = params;
      const callsArray: {
        to: `0x${string}`;
        data: `0x${string}`;
        value?: bigint;
      }[] = [];

      if (!v2EscrowAddress) {
        throw new Error('V2 escrow address not configured');
      }

      // Parse collateral amounts (predictor = auction creator = "maker" in V1 terms)
      const predictorWagerWei = mintRequest.predictorWager;

      // Validate inputs
      if (predictorWagerWei <= 0n || mintRequest.counterpartyWager <= 0n) {
        throw new Error('Invalid collateral amounts');
      }

      // Add wrap call if needed (Ethereal chain wraps native to WUSDe)
      if (isEtherealChain(chainId) && wusdeAddress) {
        const wrappedBal =
          typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n;
        const amountToWrap =
          predictorWagerWei > wrappedBal ? predictorWagerWei - wrappedBal : 0n;

        if (amountToWrap > 0n) {
          const wrapCalldata = encodeFunctionData({
            abi: WUSDE_ABI,
            functionName: 'deposit',
          });

          callsArray.push({
            to: wusdeAddress,
            data: wrapCalldata,
            value: amountToWrap,
          });
        }
      }

      // Use fresh allowance if provided (from direct RPC), otherwise fall back to cached
      const effectiveAllowance = freshAllowance ?? currentAllowance;
      const needsApproval =
        effectiveAllowance === undefined ||
        effectiveAllowance < predictorWagerWei;

      // Add approval call if needed (batched with mint)
      if (needsApproval) {
        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [v2EscrowAddress, predictorWagerWei],
        });

        callsArray.push({
          to: collateralTokenAddress,
          data: approveCalldata,
        });
      }

      // Add PredictionMarketEscrow.mint call (V2)
      const mintCalldata = encodeFunctionData({
        abi: predictionMarketEscrowAbi,
        functionName: 'mint',
        args: [mintRequest],
      });

      callsArray.push({
        to: v2EscrowAddress,
        data: mintCalldata,
      });

      return callsArray;
    },
    [
      v2EscrowAddress,
      collateralTokenAddress,
      currentAllowance,
      chainId,
      currentWusdeBalance,
      wusdeAddress,
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

      try {
        // Validate mint data
        if (!mintData) {
          throw new Error('No mint data provided');
        }

        // Verify the maker address matches the current effective address
        if (mintData.maker?.toLowerCase() !== effectiveAddress?.toLowerCase()) {
          throw new Error(
            'Address mismatch: the auction was started with a different account. ' +
              'Please request new bids.'
          );
        }

        // Fetch fresh allowance via wagmi refetch (bypasses stale cache)
        let freshAllowance: bigint | undefined;
        try {
          const { data } = await refetchAllowance();
          freshAllowance = data;
        } catch {
          freshAllowance = 0n;
        }

        // Safety net: Check bidder's (taker's) allowance and balance
        await validateTakerFunds(
          mintData.taker,
          BigInt(mintData.takerCollateral),
          collateralTokenAddress,
          targetContractAddress,
          publicClient
        );

        if (isV2Chain) {
          // V2 flow: predictor signs at accept time
          if (!v2EscrowAddress) {
            throw new Error('V2 escrow address not configured');
          }

          // Get fresh predictor nonce
          const refetchResult = await refetchV2Nonce();
          const freshV2Nonce = refetchResult.data as bigint | undefined;
          const predictorNonce = freshV2Nonce ?? v2Nonce ?? 0n;

          // Get V2 picks - prefer direct v2Picks if available (exact match to counterparty signature),
          // otherwise decode from encodedPredictedOutcomes (V1 format)
          let picks: Pick[];
          if (mintData.v2Picks && mintData.v2Picks.length > 0) {
            // Use v2Picks directly (already the exact picks the counterparty signed)
            const rawPicks: Pick[] = mintData.v2Picks.map((p) => ({
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome as 0 | 1,
            }));
            picks = canonicalizePicks(rawPicks);
            console.log('[V2 Submit] Using v2Picks from mintData:', {
              rawPicksCount: rawPicks.length,
              canonicalPicksCount: picks.length,
              picks: picks.map((p) => ({
                resolver: p.conditionResolver,
                conditionId: p.conditionId.slice(0, 10) + '...',
                outcome: p.predictedOutcome,
              })),
            });
          } else {
            // Fallback: decode from encodedPredictedOutcomes (V1 format)
            console.log('[V2 Submit] Falling back to decoding from encodedPredictedOutcomes');
            const decoded = decodeAuctionPredictedOutcomes({
              resolver: mintData.resolver,
              predictedOutcomes: [mintData.encodedPredictedOutcomes],
            });
            const rawPicks = decodedOutcomesToV2Picks(decoded, mintData.resolver);
            picks = canonicalizePicks(rawPicks);
            console.log('[V2 Submit] Decoded picks:', {
              rawPicksCount: rawPicks.length,
              canonicalPicksCount: picks.length,
              picks: picks.map((p) => ({
                resolver: p.conditionResolver,
                conditionId: p.conditionId.slice(0, 10) + '...',
                outcome: p.predictedOutcome,
              })),
            });
          }

          if (picks.length === 0) {
            throw new Error('Could not decode picks for V2 mint');
          }

          // V2 terminology mapping:
          // - predictor = auction creator (V1 "maker")
          // - counterparty = bidder (V1 "taker")
          const predictorWager = BigInt(mintData.makerCollateral);
          const counterpartyWager = BigInt(mintData.takerCollateral);
          const predictor = mintData.maker;
          const counterparty = mintData.taker;

          // Counterparty (bidder) signature from the bid - they already signed
          const counterpartySignature = mintData.takerSignature;
          const counterpartyDeadline = BigInt(mintData.takerDeadline);
          // The bidder's nonce is embedded in their signature
          const counterpartyNonce = BigInt(mintData.takerClaimedNonce ?? 0);

          // Calculate predictor deadline (same as counterparty or extend slightly)
          const nowSec = Math.floor(Date.now() / 1000);
          const predictorDeadline = BigInt(nowSec + 300); // 5 minutes from now

          // Build predictor's typed data and request signature
          const typedData = buildPredictorMintTypedData({
            picks,
            predictorWager,
            counterpartyWager,
            predictor,
            counterparty,
            predictorNonce,
            predictorDeadline,
            verifyingContract: v2EscrowAddress,
            chainId,
          });

          // Determine if we can use session key signing for V2
          // Requires: active session + session signing function + V2 session key approval
          const canUseV2SessionKey = isUsingSession && sessionSignTypedData && v2SessionKeyApproval;

          let predictorSignature: `0x${string}`;
          let predictorSessionKeyData: `0x${string}` = '0x';

          try {
            if (canUseV2SessionKey) {
              // Session key mode: sign with session key and include SessionKeyData
              console.log('[V2 Submit] Using session key signing for predictor');
              console.log('[V2 Submit] Session key approval details:', {
                sessionKey: v2SessionKeyApproval.sessionKey,
                owner: v2SessionKeyApproval.owner,
                smartAccount: v2SessionKeyApproval.smartAccount,
                validUntil: v2SessionKeyApproval.validUntil,
                permissionsHash: v2SessionKeyApproval.permissionsHash,
                chainId: v2SessionKeyApproval.chainId,
                ownerSignatureLength: v2SessionKeyApproval.ownerSignature.length,
              });
              console.log('[V2 Submit] Predictor (signer) address:', predictor);
              console.log('[V2 Submit] SmartAccount matches predictor:', v2SessionKeyApproval.smartAccount === predictor);

              // Verify accountFactory mapping before attempting mint
              try {
                const factoryVerification = await verifyAccountFactoryMapping(
                  chainId,
                  v2EscrowAddress,
                  v2SessionKeyApproval.owner,
                  predictor
                );
                console.log('[V2 Submit] AccountFactory verification:', {
                  accountFactory: factoryVerification.accountFactoryAddress,
                  owner: v2SessionKeyApproval.owner,
                  expectedSmartAccount: predictor,
                  derivedIndex0: factoryVerification.derivedAccountIndex0,
                  derivedIndex1: factoryVerification.derivedAccountIndex1,
                  matchesIndex0: factoryVerification.matchesIndex0,
                  matchesIndex1: factoryVerification.matchesIndex1,
                });
                if (!factoryVerification.matchesIndex0 && !factoryVerification.matchesIndex1) {
                  console.error('[V2 Submit] WARNING: AccountFactory does not return the expected smart account!');
                  console.error('[V2 Submit] The contract will reject the session key signature.');
                }
              } catch (verifyErr) {
                console.warn('[V2 Submit] AccountFactory verification failed:', verifyErr);
              }

              predictorSignature = await sessionSignTypedData({
                domain: {
                  ...typedData.domain,
                  chainId: Number(typedData.domain.chainId),
                },
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message as Record<string, unknown>,
              });
              // Encode the V2 SessionKeyData for contract validation
              predictorSessionKeyData = encodeV2SessionKeyData(v2SessionKeyApproval);
              console.log('[V2 Submit] Session key data encoded:', {
                length: predictorSessionKeyData.length,
                hexPrefix: predictorSessionKeyData.slice(0, 130) + '...',
                // Decode what we encoded to verify
                sessionKeyInApproval: v2SessionKeyApproval.sessionKey,
                ownerInApproval: v2SessionKeyApproval.owner,
                validUntilInApproval: v2SessionKeyApproval.validUntil,
                chainIdInApproval: v2SessionKeyApproval.chainId,
                ownerSignatureLengthInApproval: v2SessionKeyApproval.ownerSignature.length,
              });
            } else {
              // Wallet mode: sign with wallet, contract uses EIP-1271 fallback
              console.log('[V2 Submit] Using wallet signing for predictor');
              predictorSignature = await signTypedDataAsync({
                domain: {
                  ...typedData.domain,
                  chainId: Number(typedData.domain.chainId),
                },
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
              });
            }
          } catch (e: any) {
            const error =
              e instanceof Error ? e : new Error(String(e?.message || e));
            throw new Error(`Signature rejected: ${error.message}`);
          }

          // Build full V2 MintRequest
          const mintRequest = {
            picks: picks.map((p) => ({
              conditionResolver: p.conditionResolver,
              conditionId: p.conditionId,
              predictedOutcome: p.predictedOutcome,
            })),
            predictorWager,
            counterpartyWager,
            predictor,
            counterparty,
            predictorNonce,
            counterpartyNonce,
            predictorDeadline,
            counterpartyDeadline,
            predictorSignature,
            counterpartySignature,
            refCode: mintData.refCode,
            predictorSessionKeyData,
            counterpartySessionKeyData: '0x' as `0x${string}`,
          };

          console.log('[V2 Submit] Full MintRequest:', {
            picksCount: mintRequest.picks.length,
            predictorWager: mintRequest.predictorWager.toString(),
            counterpartyWager: mintRequest.counterpartyWager.toString(),
            predictor: mintRequest.predictor,
            counterparty: mintRequest.counterparty,
            predictorNonce: mintRequest.predictorNonce.toString(),
            counterpartyNonce: mintRequest.counterpartyNonce.toString(),
            predictorDeadline: mintRequest.predictorDeadline.toString(),
            counterpartyDeadline: mintRequest.counterpartyDeadline.toString(),
            predictorSignatureLength: mintRequest.predictorSignature.length,
            counterpartySignatureLength: mintRequest.counterpartySignature.length,
            refCode: mintRequest.refCode,
            predictorSessionKeyDataLength: mintRequest.predictorSessionKeyData.length,
          });

          const calls = prepareV2Calls({ mintRequest, freshAllowance });
          console.log('[V2 Submit] Prepared calls:', {
            count: calls.length,
            calls: calls.map((c, i) => ({
              index: i,
              to: c.to,
              dataLength: c.data?.length ?? 0,
              value: c.value?.toString() ?? '0',
            })),
          });
          if (calls.length === 0) {
            throw new Error('No valid calls to execute');
          }

          // Debug: Check on-chain nonces before submitting
          try {
            const escrowAbi = [
              { type: 'function', name: 'getNonce', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }
            ] as const;
            const [predictorOnChainNonce, counterpartyOnChainNonce] = await Promise.all([
              publicClient.readContract({
                address: v2EscrowAddress,
                abi: escrowAbi,
                functionName: 'getNonce',
                args: [predictor],
              }),
              publicClient.readContract({
                address: v2EscrowAddress,
                abi: escrowAbi,
                functionName: 'getNonce',
                args: [counterparty],
              }),
            ]);
            console.log('[V2 Submit] On-chain nonces:', {
              predictor: {
                address: predictor,
                onChainNonce: predictorOnChainNonce.toString(),
                requestNonce: predictorNonce.toString(),
                matches: predictorOnChainNonce === predictorNonce,
              },
              counterparty: {
                address: counterparty,
                onChainNonce: counterpartyOnChainNonce.toString(),
                requestNonce: counterpartyNonce.toString(),
                matches: counterpartyOnChainNonce === counterpartyNonce,
              },
            });
            if (predictorOnChainNonce !== predictorNonce) {
              console.error('[V2 Submit] PREDICTOR NONCE MISMATCH! On-chain:', predictorOnChainNonce.toString(), 'Request:', predictorNonce.toString());
              throw new Error(
                `Your nonce has changed (was ${predictorNonce.toString()}, now ${predictorOnChainNonce.toString()}). Please request new bids.`
              );
            }
            if (counterpartyOnChainNonce !== counterpartyNonce) {
              console.error('[V2 Submit] COUNTERPARTY NONCE MISMATCH! On-chain:', counterpartyOnChainNonce.toString(), 'Request:', counterpartyNonce.toString());
              throw new Error(
                `The bidder's nonce has changed since they signed (was ${counterpartyNonce.toString()}, now ${counterpartyOnChainNonce.toString()}). This bid is stale. Please request new bids.`
              );
            }
          } catch (nonceErr: any) {
            // Only re-throw if it's our nonce mismatch error
            if (nonceErr?.message?.includes('nonce has changed')) {
              throw nonceErr;
            }
            console.warn('[V2 Submit] Failed to fetch on-chain nonces:', nonceErr);
          }

          // Debug: simulate the mint call directly to see the actual error
          const mintCall = calls.find(c => c.to.toLowerCase() === v2EscrowAddress.toLowerCase());
          if (mintCall) {
            try {
              console.log('[V2 Submit] Simulating mint call directly...');
              await publicClient.call({
                to: mintCall.to,
                data: mintCall.data,
                account: predictor,
              });
              console.log('[V2 Submit] Direct simulation succeeded');
            } catch (simErr: any) {
              console.error('[V2 Submit] Direct simulation failed:', {
                message: simErr?.message,
                cause: simErr?.cause,
                shortMessage: simErr?.shortMessage,
                details: simErr?.details,
                data: simErr?.data,
              });
              // Continue anyway to see if bundler gives different error
            }
          }

          await sendCalls({
            calls,
            chainId,
          });
        } else {
          // V1 flow: predictor already signed (legacy mainnet path)
          // Determine nonce value - use auction-provided nonce if available
          let nonceValue: bigint | undefined;
          if (mintData.makerNonce !== undefined) {
            nonceValue = toBigIntSafe(mintData.makerNonce);
          } else {
            nonceValue = makerNonce as bigint | undefined;
          }

          // Verify on-chain nonce matches what we're sending
          const { data: freshMakerNonce } = await refetchMakerNonce();
          if (nonceValue === undefined) {
            throw new Error('Unable to determine maker nonce');
          }
          if (freshMakerNonce !== undefined && nonceValue !== freshMakerNonce) {
            throw new Error('Your nonce has changed. Please request new bids.');
          }

          const filled: MintPredictionRequestData = {
            ...mintData,
            makerNonce: nonceValue,
          };

          const calls = prepareV1Calls(filled, freshAllowance);
          if (calls.length === 0) {
            throw new Error('No valid calls to execute');
          }

          await sendCalls({
            calls,
            chainId,
          });
        }

        setIsProcessing(false);
      } catch (err: any) {
        const msg = (err?.message || '').toString();
        const isNonceErr =
          msg.includes('InvalidMakerNonce') || msg.includes('InvalidNonce');
        if (isNonceErr) {
          setError('The bid has become stale. Please request new bids.');
        } else {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to submit position prediction';
          setError(errorMessage);
        }
        setIsProcessing(false);
      }
    },
    [
      enabled,
      address,
      effectiveAddress,
      chainId,
      isV2Chain,
      v2EscrowAddress,
      v2Nonce,
      prepareV1Calls,
      prepareV2Calls,
      sendCalls,
      makerNonce,
      refetchMakerNonce,
      refetchV2Nonce,
      refetchAllowance,
      publicClient,
      isProcessing,
      collateralTokenAddress,
      targetContractAddress,
      signTypedDataAsync,
      isUsingSession,
      sessionSignTypedData,
      v2SessionKeyApproval,
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
