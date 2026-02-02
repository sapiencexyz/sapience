import { predictionMarketAbi } from '@sapience/sdk';
import { CHAIN_ID_ETHEREAL } from '@sapience/sdk/constants';
import { encodeFunctionData, erc20Abi, parseAbi } from 'viem';
import { getPublicClientForChainId } from '~/lib/utils/util';
import {
  logBidValidation,
  logBidValidationWarn,
} from '~/lib/auction/bidLogger';

// Multicall3 is deployed at the same address on all chains
const MULTICALL3_ADDRESS: `0x${string}` =
  '0xcA11bde05977b3631167028862bE2a173976CA11';

// wUSDe contract on Ethereal chain
const WUSDE_ADDRESS: `0x${string}` =
  '0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D';

// Multicall3 ABI for aggregate3
const multicall3Abi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData)',
]);

// WUSDe ABI for wrapping
const wusdeAbi = parseAbi([
  'function deposit() external payable',
  'function balanceOf(address account) external view returns (uint256)',
]);

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
  // Collateral token address (required for bundle simulation)
  collateralTokenAddress?: `0x${string}`;
  // User's current state (for determining which calls to include in bundle)
  userWusdeBalance?: bigint; // User's current wUSDe balance
  userAllowance?: bigint; // User's current allowance to PredictionMarket
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
 * Validates a bid by simulating the full transaction bundle via Multicall3.
 *
 * This simulates exactly what would be sent to the bundler:
 * 1. wUSDe deposit (wrap native USDe) - if on Ethereal and user needs more wUSDe
 * 2. ERC20 approve - if user hasn't approved enough collateral
 * 3. PredictionMarket.mint - the actual trade
 *
 * By simulating the full bundle, we accurately validate both:
 * - The user's ability to fund their side (after wrap + approve)
 * - The bidder's ability to fulfill (signature, balance, allowance, deadline, nonce)
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
    userWusdeBalance,
    userAllowance,
  } = options;

  const makerCollateralWei = BigInt(takerWager);
  const takerCollateralWei = BigInt(bid.makerWager);

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
    makerCollateral: makerCollateralWei,
    takerCollateral: takerCollateralWei,
    maker: takerAddress,
    taker: bid.maker as `0x${string}`,
    makerNonce: BigInt(takerNonce),
    takerSignature: bid.makerSignature as `0x${string}`,
    takerDeadline: BigInt(bid.makerDeadline),
    refCode: ZERO_BYTES32,
  };

  const publicClient = getPublicClientForChainId(chainId);

  // Fetch user's current state if not provided
  let currentWusdeBalance = userWusdeBalance;
  let currentAllowance = userAllowance;

  // Only fetch if we have a collateral token and values weren't provided
  if (collateralTokenAddress) {
    const fetchPromises: Promise<void>[] = [];

    // Fetch wUSDe balance on Ethereal chain if not provided
    if (chainId === CHAIN_ID_ETHEREAL && currentWusdeBalance === undefined) {
      fetchPromises.push(
        publicClient
          .readContract({
            address: WUSDE_ADDRESS,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [takerAddress],
          })
          .then((balance: bigint) => {
            currentWusdeBalance = balance;
          })
          .catch(() => {
            currentWusdeBalance = 0n;
          })
      );
    }

    // Fetch allowance if not provided
    if (currentAllowance === undefined) {
      fetchPromises.push(
        publicClient
          .readContract({
            address: collateralTokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [takerAddress, predictionMarketAddress],
          })
          .then((allowance: bigint) => {
            currentAllowance = allowance;
          })
          .catch(() => {
            currentAllowance = 0n;
          })
      );
    }

    // Wait for all fetches to complete
    if (fetchPromises.length > 0) {
      await Promise.all(fetchPromises);
    }
  }

  // Build the calls array - same logic as prepareCalls in useSubmitPosition.ts
  const calls: {
    target: `0x${string}`;
    allowFailure: boolean;
    callData: `0x${string}`;
  }[] = [];
  let totalValue = 0n;

  // 1. Wrap USDe → wUSDe (if on Ethereal chain and user needs more wUSDe)
  if (chainId === CHAIN_ID_ETHEREAL && collateralTokenAddress) {
    const wusdeBalance = currentWusdeBalance ?? 0n;
    const amountToWrap =
      makerCollateralWei > wusdeBalance
        ? makerCollateralWei - wusdeBalance
        : 0n;

    if (amountToWrap > 0n) {
      const wrapCalldata = encodeFunctionData({
        abi: wusdeAbi,
        functionName: 'deposit',
      });
      calls.push({
        target: WUSDE_ADDRESS,
        allowFailure: false,
        callData: wrapCalldata,
      });
      totalValue = amountToWrap;
    }
  }

  // 2. Approve collateral token (if user hasn't approved enough)
  if (collateralTokenAddress) {
    const allowance = currentAllowance ?? 0n;
    const needsApproval = allowance < makerCollateralWei;

    if (needsApproval) {
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [predictionMarketAddress, makerCollateralWei],
      });
      calls.push({
        target: collateralTokenAddress,
        allowFailure: false,
        callData: approveCalldata,
      });
    }
  }

  // 3. Mint prediction position
  const mintCalldata = encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: 'mint',
    args: [mintPredictionRequestData],
  });
  calls.push({
    target: predictionMarketAddress,
    allowFailure: false,
    callData: mintCalldata,
  });

  try {
    // Simulate the full bundle via Multicall3.aggregate3
    // This executes all calls atomically, just like the bundler would
    await publicClient.simulateContract({
      address: MULTICALL3_ADDRESS,
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [calls],
      account: takerAddress,
      value: totalValue,
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
      } else if (msg.includes('InsufficientAllowance')) {
        errorMessage = 'Bidder has insufficient allowance';
      } else if (msg.includes('InsufficientBalance')) {
        errorMessage = 'Bidder has insufficient balance';
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
