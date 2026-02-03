import { predictionMarketAbi } from '@sapience/sdk';
import { concat, keccak256, toHex } from 'viem';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';

/**
 * Solady ERC20 storage slot constants.
 * See: https://github.com/Vectorized/solady/blob/main/src/tokens/ERC20.sol
 *
 * Solady uses a custom storage layout with inline assembly for gas efficiency:
 * - Balance slot = keccak256(owner || BALANCE_SLOT_SEED)
 * - Allowance slot = keccak256(owner || ALLOWANCE_SLOT_SEED || spender)
 *
 * The seeds are derived from Solady's internal constants:
 * - _BALANCE_SLOT_SEED = 0x87a211a2 (encoded with 12-byte prefix of zeros)
 * - _ALLOWANCE_SLOT_SEED = 0x7f5e9f20 (encoded with 12-byte prefix of zeros)
 */
const SOLADY_BALANCE_SLOT_SEED = '0x000000000000000087a211a2' as `0x${string}`; // 12 bytes
const SOLADY_ALLOWANCE_SLOT_SEED =
  '0x00000000000000007f5e9f20' as `0x${string}`; // 12 bytes

/**
 * Get balance storage slot for Solady ERC20.
 * Formula: keccak256(owner || BALANCE_SLOT_SEED)
 * Where owner is 20 bytes and BALANCE_SLOT_SEED is 12 bytes = 32 bytes total
 */
function getBalanceSlot(owner: `0x${string}`): `0x${string}` {
  return keccak256(concat([owner, SOLADY_BALANCE_SLOT_SEED]));
}

/**
 * Get allowance storage slot for Solady ERC20.
 * Formula: keccak256(owner || ALLOWANCE_SLOT_SEED || spender)
 * Where owner is 20 bytes, ALLOWANCE_SLOT_SEED is 12 bytes, spender is 20 bytes = 52 bytes total
 */
function getAllowanceSlot(
  owner: `0x${string}`,
  spender: `0x${string}`
): `0x${string}` {
  return keccak256(concat([owner, SOLADY_ALLOWANCE_SLOT_SEED, spender]));
}

/**
 * Execution mode for bid simulation.
 * - 'eoa': EOA mode - simulate with EOA address as msg.sender
 * - 'session': Smart account with active session - simulate with smart account as msg.sender
 * - 'owner': Smart account without session - simulate with smart account as msg.sender
 *
 * All modes use state-override simulation which validates contract logic directly.
 */
export type ExecutionMode = 'eoa' | 'session' | 'owner';

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
  takerAddress: `0x${string}`; // auction requester - EOA or owner address
  takerWager: string; // auction requester's wager (wei)
  takerNonce: number; // auction requester's nonce
  // Market data
  encodedPredictedOutcomes: `0x${string}`;
  resolver: `0x${string}`;
  // Collateral token address (required for state override simulation)
  collateralTokenAddress: `0x${string}`;

  // Execution context for smart account path (optional - defaults to EOA mode)
  executionMode?: ExecutionMode;
  // Smart account address (used as msg.sender for session/owner modes)
  smartAccountAddress?: `0x${string}`;
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
    takerWager,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
    collateralTokenAddress,
    executionMode = 'eoa',
    smartAccountAddress,
  } = options;

  const makerCollateralWei = BigInt(takerWager);

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

  const takerCollateralWei = BigInt(bid.makerWager);

  // Build the MintPredictionRequestData struct
  // Contract field names:
  // - maker = auction requester (API taker) - this is the smart account for session mode
  // - taker = bidder (API maker)
  // - makerCollateral = auction requester's wager
  // - takerCollateral = bidder's wager
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

  // Compute storage slots for state overrides
  // We override the USER's balance and allowance to simulate post-wrap/approve state
  // But we DO NOT override the BIDDER's balance/allowance - those must be valid on-chain
  const balanceSlot = getBalanceSlot(simulationAddress);
  const allowanceSlot = getAllowanceSlot(
    simulationAddress,
    predictionMarketAddress
  );

  // Set balance and allowance to be sufficient for the transaction
  // We use a large value to ensure the simulation passes the user's funding checks
  const sufficientBalance = makerCollateralWei + 1n; // Slightly more than needed

  try {
    // Simulate the mint call with state overrides for the USER only
    // - User (maker/auction requester): simulates post-wrap/approve state
    // - Bidder (taker): uses actual on-chain balance/allowance (validates they can pay)
    // Note: viem 2.x expects stateDiff as array of [slot, value] tuples
    await publicClient.simulateContract({
      address: predictionMarketAddress,
      abi: predictionMarketAbi,
      functionName: 'mint',
      args: [mintPredictionRequestData],
      account: simulationAddress, // msg.sender = user's smart account or EOA
      stateOverride: [
        {
          // Override user's (smart account or EOA) ETH balance for gas estimation
          address: simulationAddress,
          balance: 10n ** 18n, // 1 ETH for gas
        },
        {
          address: collateralTokenAddress,
          stateDiff: [
            // Override user's balance to be sufficient
            {
              slot: balanceSlot,
              value: toHex(sufficientBalance, { size: 32 }),
            },
            // Override user's allowance to PredictionMarket
            {
              slot: allowanceSlot,
              value: toHex(sufficientBalance, { size: 32 }),
            },
            // NOTE: Bidder's balance and allowance are NOT overridden
            // If bidder has insufficient funds/allowance, simulation will fail
          ],
        },
      ],
    });

    return { isValid: true };
  } catch (err: unknown) {
    // Extract error message from the simulation failure
    let errorMessage = 'Simulation failed';

    // Always log the full error for debugging
    console.log('=== BID SIMULATION ERROR ===');
    console.log('Bid maker:', bid.maker);
    console.log('Error:', err);

    if (err instanceof Error) {
      const msg = err.message;

      // Log key viem error properties
      const viemErr = err as {
        cause?: { data?: unknown; reason?: string; message?: string };
        details?: string;
        shortMessage?: string;
        metaMessages?: string[];
      };
      console.log('Error message (first 500 chars):', msg.slice(0, 500));
      console.log('Error cause:', viemErr.cause);
      console.log('Error details:', viemErr.details);
      console.log('Error shortMessage:', viemErr.shortMessage);
      console.log('Error metaMessages:', viemErr.metaMessages);
      console.log('=== END ERROR ===');

      // Parse common contract errors
      if (msg.includes('InvalidTakerSignature')) {
        errorMessage = 'Invalid bid signature';
      } else if (msg.includes('TakerDeadlineExpired')) {
        errorMessage = 'Bid has expired';
      } else if (msg.includes('InvalidMakerNonce')) {
        errorMessage = 'Nonce already used';
      } else if (msg.includes('InvalidTakerNonce')) {
        // Bidder's nonce is stale (contract taker = API maker)
        errorMessage = 'Bidder nonce is stale';
      } else if (msg.includes('SafeERC20FailedOperation')) {
        errorMessage = 'Bidder has insufficient funds or allowance';
      } else if (msg.includes('InsufficientAllowance')) {
        errorMessage = 'Bidder has insufficient allowance';
      } else if (msg.includes('InsufficientBalance')) {
        errorMessage = 'Bidder has insufficient balance';
      } else if (msg.includes('AllowanceExpired')) {
        // Permit2-style allowance has expired
        errorMessage = "Bidder's allowance has expired";
      } else if (msg.includes('0x13be252b')) {
        // InsufficientAllowance() from wUSDe token
        errorMessage = 'Bidder has insufficient allowance';
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
      } else if (msg.includes('MakerIsNotCaller')) {
        // This should not happen with state overrides - indicates a bug
        errorMessage = 'Simulation error: msg.sender mismatch';
      } else if (msg.includes('revert') || msg.includes('execution reverted')) {
        // Generic revert - try to extract any hex selector for debugging
        const selectorMatch = msg.match(/0x[a-fA-F0-9]{8}/);
        errorMessage = selectorMatch
          ? `Contract reverted with selector: ${selectorMatch[0]}`
          : 'Contract execution reverted';
      } else if (
        msg.includes('unknown error') ||
        msg.includes('Unknown error')
      ) {
        // viem couldn't decode the error - try to extract hex data
        const viemErr = err as { cause?: { data?: string }; data?: string };
        const errorData = viemErr.data || viemErr.cause?.data;
        if (errorData && typeof errorData === 'string') {
          // Extract first 10 chars of error data (4-byte selector + "0x")
          const selector = errorData.slice(0, 10);
          errorMessage = `Unknown contract error (selector: ${selector})`;
        } else {
          // Try to find any hex selector in the message
          const selectorMatch = msg.match(/0x[a-fA-F0-9]{8,}/);
          errorMessage = selectorMatch
            ? `Unknown contract error (data: ${selectorMatch[0].slice(0, 18)}...)`
            : 'Unknown contract error';
        }
      } else {
        // Use a truncated version of the error message
        errorMessage = msg.slice(0, 200);
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
