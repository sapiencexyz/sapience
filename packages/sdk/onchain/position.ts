/**
 * Pure position submission utilities.
 *
 * Extracted from packages/app/src/hooks/forms/useSubmitPosition.ts
 *
 * @module onchain/position
 */

import { encodeFunctionData, erc20Abi, parseAbi, zeroAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { predictionMarketAbi, predictionMarketEscrowAbi } from '../abis';
import { CHAIN_ID_ETHEREAL, CHAIN_ID_ETHEREAL_TESTNET } from '../constants/chain';
import { collateralToken } from '../contracts/addresses';

const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

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
 * Validate that a taker (bidder / market-maker) has sufficient on-chain balance
 * and allowance to cover the collateral.
 *
 * @throws Error with a user-facing message when funds are insufficient.
 */
export async function validateTakerFunds(
  takerAddress: `0x${string}` | undefined,
  takerCollateralWei: bigint,
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
  if (!takerAddress || !collateralTokenAddress || !predictionMarketAddress) {
    return;
  }

  try {
    const [takerAllowance, takerBalance] = (await Promise.all([
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
    ])) as [bigint, bigint];

    if (
      takerAllowance < takerCollateralWei ||
      takerBalance < takerCollateralWei
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
  encodedPredictedOutcomes: `0x${string}`;
  resolver: `0x${string}`;
  makerCollateral: string | bigint;
  takerCollateral: string | bigint;
  maker: `0x${string}`;
  taker: `0x${string}`;
  makerNonce?: string | number | bigint;
  takerSignature: `0x${string}`;
  takerDeadline: string | number | bigint;
  /** Predictor's deadline (unix seconds) */
  makerDeadline: string | number | bigint;
  refCode: `0x${string}`;
  // Escrow-specific fields
  escrowPicks?: Array<{
    conditionResolver: `0x${string}`;
    conditionId: `0x${string}`;
    predictedOutcome: number;
  }>;
  /** Counterparty nonce (escrow: bidder's nonce from their signature) */
  takerClaimedNonce?: number | bigint;
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
  /** Whether this is an escrow chain (uses PredictionMarketEscrow ABI) */
  isEscrowChain?: boolean;
}

/**
 * Build the batched calls array for a position mint:
 *   1. (optional) Wrap native USDe → wUSDe
 *   2. (optional) Approve wUSDe → PredictionMarket (skipped when fully sponsored)
 *   3. PredictionMarket.mint(...) or PredictionMarketEscrow.mint(...)
 *
 * Supports both legacy (V1) and escrow mint paths.
 * When `mintData.escrowPicks` is present OR `isEscrowChain` is true, uses the
 * escrow MintRequest struct which includes picks, session key data, and sponsorship fields.
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
    isEscrowChain,
  } = params;

  const calls: { to: Address; data: `0x${string}`; value?: bigint }[] = [];

  const makerCollateralWei = BigInt(mintData.makerCollateral);
  const takerCollateralWei = BigInt(mintData.takerCollateral);

  if (makerCollateralWei <= 0n || takerCollateralWei <= 0n) {
    throw new Error('Invalid collateral amounts');
  }

  // Determine if this mint is sponsored (sponsor pays predictor's collateral)
  const isSponsored =
    !!mintData.predictorSponsor &&
    mintData.predictorSponsor !== zeroAddress;

  // Determine if this is an escrow mint
  const useEscrow =
    isEscrowChain || (mintData.escrowPicks && mintData.escrowPicks.length > 0);

  // 1. Wrap if on Ethereal and wUSDe balance is insufficient
  // Skip wrap when fully sponsored (sponsor pays, not user)
  const isEthereal = chainId === CHAIN_ID_ETHEREAL || chainId === CHAIN_ID_ETHEREAL_TESTNET;
  if (isEthereal && !isSponsored) {
    const wusdeAddress = collateralToken[chainId]?.address ?? collateralToken[CHAIN_ID_ETHEREAL]?.address;
    const wrappedBal =
      typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n;
    const amountToWrap =
      makerCollateralWei > wrappedBal ? makerCollateralWei - wrappedBal : 0n;

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
    if (effectiveAllowance < makerCollateralWei) {
      calls.push({
        to: collateralTokenAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [predictionMarketAddress, makerCollateralWei],
        }),
      });
    }
  }

  // 3. Mint call
  const makerNonceBigInt = toBigIntSafe(mintData.makerNonce);
  if (makerNonceBigInt === undefined) {
    throw new Error('Missing maker nonce');
  }

  if (useEscrow) {
    // Escrow MintRequest struct
    const picks = (mintData.escrowPicks || []).map((p) => ({
      conditionResolver: p.conditionResolver,
      conditionId: p.conditionId,
      predictedOutcome: p.predictedOutcome,
    }));

    if (picks.length === 0) {
      throw new Error('Escrow mint requires picks');
    }

    const escrowMintRequest = {
      picks,
      predictorCollateral: makerCollateralWei,
      counterpartyCollateral: takerCollateralWei,
      predictor: mintData.maker,
      counterparty: mintData.taker,
      predictorNonce: makerNonceBigInt,
      counterpartyNonce: BigInt(mintData.takerClaimedNonce ?? 0),
      predictorDeadline: BigInt(mintData.makerDeadline),
      counterpartyDeadline: BigInt(mintData.takerDeadline),
      predictorSignature: (mintData.predictorSignature || '0x') as Hex,
      counterpartySignature: mintData.takerSignature,
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
        args: [escrowMintRequest],
      }),
    });
  } else {
    // Legacy V1 mint struct
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

    calls.push({
      to: predictionMarketAddress,
      data: encodeFunctionData({
        abi: predictionMarketAbi,
        functionName: 'mint',
        args: [mintPredictionRequestData],
      }),
    });
  }

  return calls;
}
