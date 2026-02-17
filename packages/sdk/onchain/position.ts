/**
 * Pure position submission utilities.
 *
 * Extracted from packages/app/src/hooks/forms/useSubmitPosition.ts
 *
 * @module onchain/position
 */

import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';
import type { Address } from 'viem';
import { predictionMarketAbi } from '../abis';
import { CHAIN_ID_ETHEREAL } from '../constants/chain';

/** wUSDe contract address on Ethereal */
const WUSDE_ADDRESS: Address = '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

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
  refCode: `0x${string}`;
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
 *   2. (optional) Approve wUSDe → PredictionMarket
 *   3. PredictionMarket.mint(...)
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

  const makerCollateralWei = BigInt(mintData.makerCollateral);
  const takerCollateralWei = BigInt(mintData.takerCollateral);

  if (makerCollateralWei <= 0n || takerCollateralWei <= 0n) {
    throw new Error('Invalid collateral amounts');
  }

  // 1. Wrap if on Ethereal and wUSDe balance is insufficient
  if (chainId === CHAIN_ID_ETHEREAL) {
    const wrappedBal =
      typeof currentWusdeBalance === 'bigint' ? currentWusdeBalance : 0n;
    const amountToWrap =
      makerCollateralWei > wrappedBal ? makerCollateralWei - wrappedBal : 0n;

    if (amountToWrap > 0n) {
      calls.push({
        to: WUSDE_ADDRESS,
        data: encodeFunctionData({
          abi: WUSDE_ABI,
          functionName: 'deposit',
        }),
        value: amountToWrap,
      });
    }
  }

  // 2. Approve if needed
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

  // 3. Mint call
  const makerNonceBigInt = toBigIntSafe(mintData.makerNonce);
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

  calls.push({
    to: predictionMarketAddress,
    data: encodeFunctionData({
      abi: predictionMarketAbi,
      functionName: 'mint',
      args: [mintPredictionRequestData],
    }),
  });

  return calls;
}
