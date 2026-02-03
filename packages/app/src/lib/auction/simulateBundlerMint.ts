import { predictionMarketAbi } from '@sapience/sdk';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { encodeFunctionData, erc20Abi, parseAbi, type Hex } from 'viem';
import { type KernelAccountClient } from '@zerodev/sdk';
import type { MintPredictionRequestData } from './useAuctionStart';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';

// WUSDe ABI for wrapping
const WUSDE_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

// WUSDe address on Ethereal
const WUSDE_ADDRESS_ETHEREAL: `0x${string}` =
  '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

const ZERO_BYTES32: `0x${string}` = `0x${'0'.repeat(64)}`;

/**
 * Options for bundler-based bid simulation (smart account mode).
 */
export interface SimulateBundlerMintOptions {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  collateralTokenAddress: `0x${string}`;

  // User context
  userAddress: `0x${string}`;
  userWusdeBalance: bigint;
  userAllowance: bigint;
  makerCollateralWei: bigint;

  // Mint data (built from bid)
  mintRequestData: MintPredictionRequestData;

  // Bundler client - required for session mode
  sessionClient?: KernelAccountClient;

  // For owner mode (smart account without session)
  smartAccountAddress?: `0x${string}`;
}

/**
 * Result of bundler-based simulation.
 */
export interface SimulateBundlerMintResult {
  isValid: boolean;
  error?: string;
  estimatedGas?: bigint;
  needsWrap?: boolean;
  needsApprove?: boolean;
}

/**
 * Build the transaction calls array for minting a position.
 * This mirrors the logic in useSubmitPosition.prepareCalls().
 */
function buildMintCalls(options: SimulateBundlerMintOptions): {
  to: `0x${string}`;
  data: Hex;
  value: bigint;
}[] {
  const {
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    userWusdeBalance,
    userAllowance,
    makerCollateralWei,
    mintRequestData,
  } = options;

  const calls: { to: `0x${string}`; data: Hex; value: bigint }[] = [];

  // For Ethereal chain, check if we need to wrap native USDe
  if (chainId === CHAIN_ID_ETHEREAL) {
    const amountToWrap =
      makerCollateralWei > userWusdeBalance
        ? makerCollateralWei - userWusdeBalance
        : 0n;

    if (amountToWrap > 0n) {
      const wrapCalldata = encodeFunctionData({
        abi: WUSDE_ABI,
        functionName: 'deposit',
      });

      calls.push({
        to: WUSDE_ADDRESS_ETHEREAL,
        data: wrapCalldata,
        value: amountToWrap,
      });
    }
  }

  // Check if approval is needed
  const needsApproval = userAllowance < makerCollateralWei;

  if (needsApproval) {
    const approveCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [predictionMarketAddress, makerCollateralWei],
    });

    calls.push({
      to: collateralTokenAddress,
      data: approveCalldata,
      value: 0n,
    });
  }

  // Build the mint call
  const makerNonceBigInt =
    mintRequestData.makerNonce !== undefined
      ? BigInt(mintRequestData.makerNonce)
      : 0n;

  const mintPredictionRequestData = {
    encodedPredictedOutcomes: mintRequestData.encodedPredictedOutcomes,
    resolver: mintRequestData.resolver,
    makerCollateral: makerCollateralWei,
    takerCollateral: BigInt(mintRequestData.takerCollateral),
    maker: mintRequestData.maker,
    taker: mintRequestData.taker,
    makerNonce: makerNonceBigInt,
    takerSignature: mintRequestData.takerSignature,
    takerDeadline: BigInt(mintRequestData.takerDeadline),
    refCode: mintRequestData.refCode || ZERO_BYTES32,
  };

  const mintCalldata = encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: 'mint',
    args: [mintPredictionRequestData],
  });

  calls.push({
    to: predictionMarketAddress,
    data: mintCalldata,
    value: 0n,
  });

  return calls;
}

/**
 * Simulate a bid mint transaction via the bundler (for smart account mode).
 *
 * This uses the bundler's gas estimation to validate the transaction,
 * which tests the full execution path including paymaster validation.
 *
 * For session mode: uses the provided sessionClient directly
 * For owner mode: the caller should provide a sessionClient created via
 *   the owner's kernel account (similar to executeSudoTransaction)
 *
 * @param options - Bundler simulation options
 * @returns Promise<SimulateBundlerMintResult> - validation result with gas estimate
 */
export async function simulateBundlerMint(
  options: SimulateBundlerMintOptions
): Promise<SimulateBundlerMintResult> {
  const {
    chainId,
    userAddress,
    userWusdeBalance,
    userAllowance,
    makerCollateralWei,
    sessionClient,
  } = options;

  // Must have a session client for bundler simulation
  if (!sessionClient) {
    logBidValidationWarn(
      'simulateBundlerMint called without sessionClient - falling back to valid'
    );
    return { isValid: true };
  }

  // Check if account is available
  if (!sessionClient.account) {
    logBidValidationWarn('Session client account not available');
    return { isValid: true };
  }

  try {
    // Build the calls array (same as useSubmitPosition.prepareCalls)
    const calls = buildMintCalls(options);

    const needsWrap =
      chainId === CHAIN_ID_ETHEREAL && makerCollateralWei > userWusdeBalance;
    const needsApprove = userAllowance < makerCollateralWei;

    logBidValidation(
      `Bundler simulation: ${calls.length} call(s), needsWrap=${needsWrap}, needsApprove=${needsApprove}`
    );

    // Use estimateUserOperationGas directly with calls array
    // This bypasses paymaster signature validation (AA23 issue) and just simulates the calls
    const gasEstimate = await sessionClient.estimateUserOperationGas({
      account: sessionClient.account,
      calls: calls,
    });

    // If we got here, the simulation passed
    logBidValidation(
      `Bundler simulation passed: callGasLimit=${gasEstimate.callGasLimit}`
    );

    return {
      isValid: true,
      estimatedGas: gasEstimate.callGasLimit,
      needsWrap,
      needsApprove,
    };
  } catch (err: unknown) {
    // Log the raw error for debugging
    console.log('=== BUNDLER SIMULATION ERROR ===');
    console.log('User:', userAddress);
    console.log('Error:', err);

    let errorMessage = 'Bundler simulation failed';

    if (err instanceof Error) {
      const msg = err.message;
      console.log('Error message:', msg.slice(0, 500));

      // Parse error messages to provide meaningful feedback
      if (
        msg.includes('does not exist') ||
        msg.includes('not available') ||
        msg.includes('Unrecognized key')
      ) {
        // RPC method not supported - likely ZeroDev API compatibility issue
        errorMessage = 'Bundler RPC error: ' + msg.slice(0, 150);
      } else if (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('fetch failed')
      ) {
        errorMessage = 'Bundler network error: ' + msg.slice(0, 100);
      } else if (msg.includes('AA21') || msg.includes('insufficient funds')) {
        errorMessage = 'Insufficient native USDe for wrapping';
      } else if (msg.includes('AA23') || msg.includes('AA24')) {
        errorMessage = 'Session key signature validation failed';
      } else if (msg.includes('AA25')) {
        errorMessage = 'Account nonce mismatch';
      } else if (
        msg.includes('validateUserOp') ||
        msg.includes('session') ||
        msg.includes('policy')
      ) {
        errorMessage = 'Session key validation failed';
      } else if (msg.includes('InvalidTakerSignature')) {
        errorMessage = 'Invalid bid signature';
      } else if (msg.includes('TakerDeadlineExpired')) {
        errorMessage = 'Bid has expired';
      } else if (msg.includes('InvalidMakerNonce')) {
        errorMessage = 'Nonce already used';
      } else if (msg.includes('InvalidTakerNonce')) {
        errorMessage = 'Bidder nonce is stale';
      } else if (msg.includes('SafeERC20FailedOperation')) {
        errorMessage = 'Bidder has insufficient funds or allowance';
      } else if (msg.includes('InsufficientAllowance')) {
        errorMessage = 'Bidder has insufficient allowance';
      } else if (msg.includes('InsufficientBalance')) {
        errorMessage = 'Bidder has insufficient balance';
      } else if (
        msg.includes('AllowanceExpired') ||
        msg.includes('0x13be252b')
      ) {
        errorMessage = "Bidder's allowance has expired";
      } else if (msg.includes('execution reverted')) {
        const selectorMatch = msg.match(/0x[a-fA-F0-9]{8}/);
        errorMessage = selectorMatch
          ? `Contract reverted with selector: ${selectorMatch[0]}`
          : 'Contract execution reverted';
      } else {
        // Unknown error - include truncated message for debugging
        errorMessage = 'Bundler error: ' + msg.slice(0, 150);
      }

      console.log('Parsed error:', errorMessage);
    }

    console.log('=== END ERROR ===');

    return { isValid: false, error: errorMessage };
  }
}
