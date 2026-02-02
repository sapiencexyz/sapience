import { predictionMarketAbi } from '@sapience/sdk';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';

/**
 * Options for simulating a bid mint transaction.
 *
 * Role mapping (important!):
 * - Contract "maker" = API "taker" (auction creator/requester) - calls mint()
 * - Contract "taker" = API "maker" (bidder) - signs the bid
 */
export interface SimulateBidMintOptions {
  chainId: number;
  predictionMarketAddress: `0x${string}`;
  // Auction (API taker = contract maker)
  takerAddress: `0x${string}`; // auction requester - will be msg.sender
  takerWager: string; // auction requester's wager (wei)
  takerNonce: number; // auction requester's nonce
  // Market data
  encodedPredictedOutcomes: `0x${string}`;
  resolver: `0x${string}`;
}

export interface SimulateBidResult {
  isValid: boolean;
  error?: string;
}

/**
 * Bid data from the API (bidder/market maker).
 * In API terms: maker = bidder
 * In contract terms: taker = bidder
 */
export interface BidData {
  maker: string; // bidder address (API maker = contract taker)
  makerWager: string; // bidder's wager (wei)
  makerDeadline: number; // bid expiry (unix seconds)
  makerSignature: string; // bidder's signature
  makerNonce: number; // bidder's nonce
}

const ZERO_BYTES32: `0x${string}` = `0x${'0'.repeat(64)}`;

/**
 * Validates a bid by simulating the mint transaction via RPC.
 *
 * This function builds the `MintPredictionRequestData` struct from the bid and auction data,
 * then calls `publicClient.simulateContract()` with the auction requester as the account.
 *
 * The simulation catches all revert reasons including:
 * - InvalidTakerSignature (bad bid signature)
 * - TakerDeadlineExpired (bid expired)
 * - InvalidMakerNonce (nonce already used)
 * - SafeERC20FailedOperation (insufficient balance/allowance)
 * - And any other contract errors
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
    takerWager,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
  } = options;

  // Build the MintPredictionRequestData struct
  // Contract field names:
  // - maker = auction requester (API taker)
  // - taker = bidder (API maker)
  // - makerCollateral = auction requester's wager
  // - takerCollateral = bidder's wager
  // - makerNonce = auction requester's nonce
  // - takerSignature = bidder's signature
  // - takerDeadline = bid expiry
  const mintPredictionRequestData = {
    encodedPredictedOutcomes,
    resolver,
    makerCollateral: BigInt(takerWager),
    takerCollateral: BigInt(bid.makerWager),
    maker: takerAddress,
    taker: bid.maker as `0x${string}`,
    makerNonce: BigInt(takerNonce),
    takerSignature: bid.makerSignature as `0x${string}`,
    takerDeadline: BigInt(bid.makerDeadline),
    refCode: ZERO_BYTES32,
  };

  const publicClient = getPublicClientForChainId(chainId);

  try {
    // Simulate the mint call with the auction requester as the account
    await publicClient.simulateContract({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: 'mint',
      args: [mintPredictionRequestData],
      account: takerAddress,
    });

    return { isValid: true };
  } catch (err: unknown) {
    // Extract error message from the simulation failure
    let errorMessage = 'Simulation failed';

    if (err instanceof Error) {
      const msg = err.message;

      // Parse common contract errors
      if (msg.includes('InvalidTakerSignature')) {
        errorMessage = 'Invalid bid signature';
      } else if (msg.includes('TakerDeadlineExpired')) {
        errorMessage = 'Bid has expired';
      } else if (msg.includes('InvalidMakerNonce')) {
        errorMessage = 'Nonce already used';
      } else if (msg.includes('SafeERC20FailedOperation')) {
        errorMessage = 'Bidder has insufficient funds or allowance';
      } else if (msg.includes('CollateralBelowMinimum')) {
        errorMessage = 'Collateral below minimum';
      } else if (msg.includes('MakerCollateralMustBeGreaterThanZero')) {
        errorMessage = 'Maker collateral must be greater than zero';
      } else if (msg.includes('TakerCollateralMustBeGreaterThanZero')) {
        errorMessage = 'Taker collateral must be greater than zero';
      } else if (msg.includes('InvalidMarketsAccordingToResolver')) {
        errorMessage = 'Invalid markets according to resolver';
      } else if (msg.includes('InvalidEncodedPredictedOutcomes')) {
        errorMessage = 'Invalid encoded predicted outcomes';
      } else {
        // Use a truncated version of the error message
        errorMessage = msg.slice(0, 100);
      }
    }

    return { isValid: false, error: errorMessage };
  }
}

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface ValidatedBid<T extends BidData> {
  bid: T;
  validationStatus: ValidationStatus;
  validationError?: string;
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
 * @returns Promise<ValidatedBid<T>[]> - Array of bids with validation status
 */
export async function validateBidsWithSimulation<T extends BidData>(
  bids: T[],
  options: SimulateBidMintOptions
): Promise<ValidatedBid<T>[]> {
  logBidValidation(`Validating batch of ${bids.length} bids...`);

  const results = await Promise.all(
    bids.map(async (bid): Promise<ValidatedBid<T>> => {
      try {
        const result = await simulateBidMint(bid, options);
        return {
          bid,
          validationStatus: result.isValid ? 'valid' : 'invalid',
          validationError: result.error,
        };
      } catch (err) {
        // On RPC or unexpected errors, treat as valid to avoid blocking
        logBidValidationWarn(
          'Unexpected error for bid:',
          bid.makerSignature?.slice(0, 10),
          err
        );
        return {
          bid,
          validationStatus: 'valid',
          validationError: undefined,
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
