import { predictionMarketAbi } from '@sapience/sdk';
import {
  parseSimulationError,
  buildSimulationStateOverride,
} from '@sapience/sdk';
import type {
  ExecutionMode,
  SimulateBidResult,
  BidData,
  ValidationStatus,
  LegacyValidatedBid,
  SimulateBidMintOptions,
} from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';

// Re-export types from SDK for backward compatibility
export type { ExecutionMode, SimulateBidResult, BidData, ValidationStatus, LegacyValidatedBid, SimulateBidMintOptions };

const ZERO_BYTES32: `0x${string}` = `0x${'0'.repeat(64)}`;

/**
 * Validates a bid by simulating the mint transaction.
 *
 * Uses viem's state override feature to simulate as if the user already has:
 * 1. Sufficient collateral token balance (after wrap would complete)
 * 2. Sufficient allowance to PredictionMarket (after approve would complete)
 *
 * For smart account modes (session/owner), the smart account address is used
 * as msg.sender to correctly validate the contract's maker check.
 *
 * The simulation validates:
 * - The bidder's signature is valid
 * - The bidder's deadline hasn't expired
 * - The bidder's nonce is correct
 * - The bidder has sufficient funds and allowance (via state override)
 * - The market parameters are valid according to the resolver
 *
 * Note: Session key permissions are NOT validated here - they will be
 * validated at actual transaction submission time.
 *
 * @param bid - The bid data from the API
 * @param options - Auction context and contract addresses
 * @returns Promise<SimulateBidResult> - { isValid: true } on success, { isValid: false, error: string } on failure
 */
export async function simulateBidMint(
  bid: BidData,
  options: SimulateBidMintOptions
): Promise<SimulateBidResult> {
  const {
    chainId,
    predictionMarketAddress,
    takerAddress,
    takerCollateral,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
    collateralTokenAddress,
    executionMode = 'eoa',
    smartAccountAddress,
  } = options;

  const makerCollateralWei = BigInt(takerCollateral);

  // Determine the address to use as msg.sender in simulation
  // For smart account modes, use the smart account address
  const simulationAddress =
    executionMode !== 'eoa' && smartAccountAddress
      ? smartAccountAddress
      : takerAddress;

  // Use state-override simulation for all modes
  // This validates bid signatures, nonces, expiry, and contract logic
  // Session key permissions will be validated at actual transaction submission time
  logBidValidation(
    `Using state-override simulation for ${executionMode} mode (${simulationAddress.slice(0, 10)}...)`
  );

  const takerCollateralWei = BigInt(bid.makerCollateral);

  // Build the MintPredictionRequestData struct
  // Contract field names:
  // - maker = auction requester (API taker) - this is the smart account for session mode
  // - taker = bidder (API maker)
  // - makerCollateral = auction requester's position size
  // - takerCollateral = bidder's position size
  // - makerNonce = auction requester's nonce
  // - takerSignature = bidder's signature
  // - takerDeadline = bid expiry
  const mintPredictionRequestData = {
    encodedPredictedOutcomes,
    resolver,
    makerCollateral: makerCollateralWei,
    takerCollateral: takerCollateralWei,
    maker: simulationAddress, // Smart account address for session mode, EOA for EOA mode
    taker: bid.maker as `0x${string}`,
    makerNonce: BigInt(takerNonce),
    takerSignature: bid.makerSignature as `0x${string}`,
    takerDeadline: BigInt(bid.makerDeadline),
    refCode: ZERO_BYTES32,
  };

  const publicClient = getPublicClientForChainId(chainId);

  // Pre-simulation nonce validation: check if the taker's nonce matches on-chain
  // This catches stale nonces early with a clear error message
  // Note: nonces are tracked per smart account address, not EOA
  try {
    const actualNonce = await publicClient.readContract({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: 'nonces',
      args: [simulationAddress],
    });

    if (actualNonce !== BigInt(takerNonce)) {
      logBidValidationWarn(
        `Nonce mismatch for taker ${simulationAddress.slice(0, 10)}: expected ${takerNonce}, actual ${actualNonce}`
      );
      return {
        isValid: false,
        error: `Taker nonce stale (expected ${takerNonce}, actual ${actualNonce})`,
      };
    }
  } catch (nonceErr) {
    // If we can't read the nonce, log but continue with simulation
    // The simulation itself will catch any nonce errors
    logBidValidationWarn(
      `Failed to pre-check nonce for ${simulationAddress.slice(0, 10)}:`,
      nonceErr
    );
  }

  // Build state overrides using SDK helper
  const stateOverride = buildSimulationStateOverride({
    simulationAddress,
    collateralTokenAddress,
    predictionMarketAddress,
    makerCollateralWei,
  });

  try {
    await publicClient.simulateContract({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: 'mint',
      args: [mintPredictionRequestData],
      account: simulationAddress,
      stateOverride,
    });

    return { isValid: true };
  } catch (err: unknown) {
    // Log for debugging
    console.debug('=== BID SIMULATION ERROR ===');
    console.debug('Bid maker:', bid.maker);
    console.debug('Error:', err);
    console.debug('=== END ERROR ===');

    // Use SDK's centralised error parser
    const errorMessage = parseSimulationError(err);
    return { isValid: false, error: errorMessage };
  }
}

/**
 * Validates multiple bids in parallel by simulating mint transactions.
 *
 * On RPC or unexpected errors, bids are treated as valid to avoid blocking users.
 * Only contract revert errors (invalid signature, expired, insufficient funds, etc.)
 * will mark a bid as invalid.
 *
 * @param bids - Array of bid data from the API
 * @param options - Auction context and contract addresses
 * @returns Promise<LegacyValidatedBid<T>[]> - Array of bids with validation status
 */
export async function validateBidsWithSimulation<T extends BidData>(
  bids: T[],
  options: SimulateBidMintOptions
): Promise<LegacyValidatedBid<T>[]> {
  logBidValidation(`Validating batch of ${bids.length} bids...`);

  const results = await Promise.all(
    bids.map(async (bid): Promise<LegacyValidatedBid<T>> => {
      try {
        const result = await simulateBidMint(bid, options);
        return {
          bid,
          validationStatus: result.isValid ? 'valid' : 'invalid',
          validationError: result.error,
        };
      } catch (err) {
        // On RPC or unexpected errors, treat as invalid to be safe
        const errorMsg =
          err instanceof Error ? err.message.slice(0, 100) : 'Unknown error';
        logBidValidationWarn(
          'Unexpected error for bid:',
          bid.makerSignature?.slice(0, 10),
          err
        );
        return {
          bid,
          validationStatus: 'invalid',
          validationError: `Validation failed: ${errorMsg}`,
        };
      }
    })
  );

  // Log validation results
  const validCount = results.filter(
    (r) => r.validationStatus === 'valid'
  ).length;
  const invalidCount = results.filter(
    (r) => r.validationStatus === 'invalid'
  ).length;
  logBidValidation(`Results: ${validCount} valid, ${invalidCount} invalid`);
  results.forEach((r) => {
    const makerShort = `${r.bid.maker.slice(0, 8)}...`;
    if (r.validationStatus === 'valid') {
      logBidValidation(`  - ${makerShort} -> valid`);
    } else {
      logBidValidation(
        `  - ${makerShort} -> invalid: ${r.validationError || 'unknown reason'}`
      );
    }
  });

  return results;
}
