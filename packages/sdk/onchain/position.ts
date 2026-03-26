/**
 * Pure position submission utilities.
 *
 * Extracted from packages/app/src/hooks/forms/useSubmitPosition.ts
 *
 * @module onchain/position
 */

import { encodeFunctionData, erc20Abi, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { predictionMarketEscrowAbi } from '../abis';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '../constants/chain';
import { collateralToken } from '../contracts/addresses';
import { WUSDE_ABI } from './sharedAbis';

/**
 * Safely convert a string / number / bigint to bigint.
 * Returns `undefined` when the input is `undefined`.
 */
export function toBigIntSafe(
  value: string | number | bigint | undefined
): bigint | undefined {
  if (value === undefined) return undefined;
  return BigInt(value);
}

/**
 * Validate that a counterparty (bidder / market-maker) has sufficient on-chain balance
 * and allowance to cover the collateral.
 *
 * @throws Error with a user-facing message when funds are insufficient.
 */
export async function validateCounterpartyFunds(
  counterpartyAddress: `0x${string}` | undefined,
  counterpartyCollateralWei: bigint,
  collateralTokenAddress: `0x${string}`,
  predictionMarketAddress: `0x${string}`,
  publicClient: {
    readContract: (args: {
      address: `0x${string}`;
      abi: readonly unknown[];
      functionName: string;
      args: readonly unknown[];
    }) => Promise<unknown>;
  }
): Promise<void> {
  if (
    !counterpartyAddress ||
    !collateralTokenAddress ||
    !predictionMarketAddress
  ) {
    return;
  }

  try {
    const [counterpartyAllowance, counterpartyBalance] = (await Promise.all([
      publicClient.readContract({
        address: collateralTokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [counterpartyAddress, predictionMarketAddress],
      }),
      publicClient.readContract({
        address: collateralTokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [counterpartyAddress],
      }),
    ])) as [bigint, bigint];

    if (
      counterpartyAllowance < counterpartyCollateralWei ||
      counterpartyBalance < counterpartyCollateralWei
    ) {
      throw new Error(
        'This bid is no longer valid. The market maker has insufficient funds. Please request new bids.'
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('market maker')) {
      throw e;
    }
    // Silently continue on RPC failures
  }
}

// ─── Mint Call Building ──────────────────────────────────────────────────────

/**
 * Minimal shape of the MintPredictionRequestData needed for call building.
 * The hook's full type may have additional fields.
 */
export interface MintPredictionRequestDataLike {
  predictorCollateral: string | bigint;
  counterpartyCollateral: string | bigint;
  predictor: `0x${string}`;
  counterparty: `0x${string}`;
  predictorNonce?: string | number | bigint;
  counterpartySignature: `0x${string}`;
  counterpartyDeadline: string | number | bigint;
  predictorDeadline: string | number | bigint;
  refCode: `0x${string}`;
  picks: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
  /** Counterparty nonce (bidder's nonce from their signature) */
  counterpartyClaimedNonce?: number | bigint;
  /** Predictor session key data (base64 encoded, empty if EOA) */
  predictorSessionKeyData?: string;
  /** Counterparty session key data (base64 encoded, empty if EOA) */
  counterpartySessionKeyData?: string;
  /** Predictor's EIP-712 MintApproval signature (required for escrow mints) */
  predictorSignature?: `0x${string}`;
  // Sponsorship fields
  predictorSponsor?: `0x${string}`;
  predictorSponsorData?: `0x${string}`;
}

export interface PrepareMintCallsParams {
  mintData: MintPredictionRequestDataLike;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  chainId: number;
  /** Current wUSDe balance (used to avoid unnecessary wraps) */
  currentWusdeBalance?: bigint;
  /** Current allowance to prediction market (used to skip approve) */
  currentAllowance?: bigint;
}

/**
 * Build the batched calls array for a position mint:
 *   1. (optional) Wrap native USDe → wUSDe
 *   2. (optional) Approve wUSDe → PredictionMarketEscrow (skipped when fully sponsored)
 *   3. PredictionMarketEscrow.mint(...)
 */
export function prepareMintCalls(
  params: PrepareMintCallsParams
): { to: Address; data: `0x${string}`; value?: bigint }[] {
  const {
    mintData,
    predictionMarketAddress,
    collateralTokenAddress,
    chainId,
    currentWusdeBalance,
    currentAllowance,
  } = params;

  const calls: { to: Address; data: `0x${string}`; value?: bigint }[] = [];

  const predictorCollateralWei = BigInt(mintData.predictorCollateral);
  const counterpartyCollateralWei = BigInt(mintData.counterpartyCollateral);

  if (predictorCollateralWei <= 0n || counterpartyCollateralWei <= 0n) {
    throw new Error('Invalid collateral amounts');
  }

  // Determine if this mint is sponsored (sponsor pays predictor's collateral)
  const isSponsored =
    !!mintData.predictorSponsor && mintData.predictorSponsor !== zeroAddress;

  // 1. Wrap if on Ethereal and wUSDe balance is insufficient
  // Skip wrap when fully sponsored (sponsor pays, not user)
  const isEthereal =
    chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;
  if (isEthereal && !isSponsored) {
    const wusdeAddress =
      collateralToken[chainId]?.address ??
      collateralToken[CHAIN_ID_ETHEREAL]?.address;
    const wrappedBal =
      typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n;
    const amountToWrap =
      predictorCollateralWei > wrappedBal
        ? predictorCollateralWei - wrappedBal
        : 0n;

    if (amountToWrap > 0n) {
      calls.push({
        to: wusdeAddress!,
        data: encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        }),
        value: amountToWrap,
      });
    }
  }

  // 2. Approve if needed (skip when sponsored — sponsor transfers, not user)
  if (!isSponsored) {
    const effectiveAllowance = currentAllowance ?? 0n;
    if (effectiveAllowance < predictorCollateralWei) {
      calls.push({
        to: collateralTokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [predictionMarketAddress, predictorCollateralWei],
        }),
      });
    }
  }

  // 3. Mint call
  const predictorNonceBigInt = toBigIntSafe(mintData.predictorNonce);
  if (predictorNonceBigInt === undefined) {
    throw new Error('Missing predictor nonce');
  }

  const picks = mintData.picks.map((p) => ({
    conditionResolver: p.conditionResolver,
    conditionId: p.conditionId,
    predictedOutcome: p.predictedOutcome,
  }));

  if (picks.length === 0) {
    throw new Error('Mint requires picks');
  }

  const mintRequest = {
    picks,
    predictorCollateral: predictorCollateralWei,
    counterpartyCollateral: counterpartyCollateralWei,
    predictor: mintData.predictor,
    counterparty: mintData.counterparty,
    predictorNonce: predictorNonceBigInt,
    counterpartyNonce: BigInt(mintData.counterpartyClaimedNonce ?? 0),
    predictorDeadline: BigInt(mintData.predictorDeadline),
    counterpartyDeadline: BigInt(mintData.counterpartyDeadline),
    predictorSignature: (mintData.predictorSignature || '0x') as Hex,
    counterpartySignature: mintData.counterpartySignature,
    refCode: mintData.refCode,
    predictorSessionKeyData: (mintData.predictorSessionKeyData
      ? mintData.predictorSessionKeyData
      : '0x') as Hex,
    counterpartySessionKeyData: (mintData.counterpartySessionKeyData
      ? mintData.counterpartySessionKeyData
      : '0x') as Hex,
    predictorSponsor: (mintData.predictorSponsor ?? zeroAddress) as Address,
    predictorSponsorData: (mintData.predictorSponsorData ?? '0x') as Hex,
  };

  calls.push({
    to: predictionMarketAddress,
    data: encodeFunctionData({
      abi: predictionMarketEscrowAbi,
      functionName: 'mint',
      args: [mintRequest],
    }),
  });

  return calls;
}
