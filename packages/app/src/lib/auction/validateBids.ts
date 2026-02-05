import { getAddress, erc20Abi } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { getPublicClientForChainId } from '~/lib/utils/util';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Selects the bid with the highest maker wager from a list of valid, non-expired bids.
 * Returns null if no valid bids are available.
 */
export function selectBestBid(bids: QuoteBid[]): QuoteBid | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const validBids = bids.filter(
    (b) => b.makerDeadline > nowSec && b.validationStatus === 'valid'
  );

  if (validBids.length === 0) return null;

  return validBids.reduce((best, cur) => {
    try {
      return BigInt(cur.makerWager) > BigInt(best.makerWager) ? cur : best;
    } catch {
      return best;
    }
  });
}

/**
 * Validates a maker address and returns validation result.
 * Helper for both sync and async validation.
 */
function validateMakerAddress(
  bid: QuoteBid
): { valid: true } | { valid: false; error: string } {
  try {
    const makerAddr = getAddress(bid.maker as `0x${string}`);
    if (makerAddr.toLowerCase() === ZERO_ADDRESS) {
      return { valid: false, error: 'Missing maker (zero address)' };
    }
    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid maker address';
    return { valid: false, error: msg };
  }
}

/**
 * Lightweight synchronous bid validity check.
 * Only checks for non-zero maker address.
 * Use validateBidsAsync for full on-chain validation.
 */
export function validateBids(bids: QuoteBid[]): QuoteBid[] {
  return bids.map((bid) => {
    const result = validateMakerAddress(bid);
    if (!result.valid) {
      return {
        ...bid,
        validationStatus: 'invalid' as const,
        validationError: result.error,
      };
    }
    // Mark as pending until async validation completes
    return {
      ...bid,
      validationStatus: 'pending' as const,
      validationError: undefined,
    };
  });
}

export interface ValidateBidsAsyncOptions {
  chainId: number;
  collateralTokenAddress: `0x${string}`;
  predictionMarketAddress: `0x${string}`;
}

/**
 * Validates bids by checking the market maker's (bid.maker) balance and allowance on-chain.
 * This ensures we don't show bids from market makers who can't actually fulfill them.
 */
export async function validateBidsAsync(
  bids: QuoteBid[],
  options: ValidateBidsAsyncOptions
): Promise<QuoteBid[]> {
  const { chainId, collateralTokenAddress, predictionMarketAddress } = options;

  if (!collateralTokenAddress || !predictionMarketAddress) {
    return bids.map((bid) => ({
      ...bid,
      validationStatus: 'pending' as const,
    }));
  }

  const publicClient = getPublicClientForChainId(chainId);

  return Promise.all(
    bids.map(async (bid): Promise<QuoteBid> => {
      // First do basic sync validation
      const addressResult = validateMakerAddress(bid);
      if (!addressResult.valid) {
        return {
          ...bid,
          validationStatus: 'invalid' as const,
          validationError: addressResult.error,
        };
      }

      // Check market maker's balance and allowance
      const makerAddress = bid.maker as `0x${string}`;
      const makerWagerWei = BigInt(bid.makerWager);

      // NOTE: SmartAccount counterparties also need wUSDe pre-funded.
      // The predictor's mint call does transferFrom(counterparty), so counterparty
      // must have wUSDe balance + allowance ready BEFORE the mint happens.

      try {
        const [makerAllowance, makerBalance] = await Promise.all([
          publicClient.readContract({
            address: collateralTokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [makerAddress, predictionMarketAddress],
          }),
          publicClient.readContract({
            address: collateralTokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [makerAddress],
          }),
        ]);

        const hasAllowance = makerAllowance >= makerWagerWei;
        const hasBalance = makerBalance >= makerWagerWei;

        if (!hasBalance) {
          return {
            ...bid,
            validationStatus: 'invalid' as const,
            validationError: 'Market maker has insufficient balance',
          };
        }

        if (!hasAllowance) {
          return {
            ...bid,
            validationStatus: 'invalid' as const,
            validationError: 'Market maker has insufficient allowance',
          };
        }

        return {
          ...bid,
          validationStatus: 'valid' as const,
          validationError: undefined,
        };
      } catch (err) {
        console.warn(
          '[validateBidsAsync] RPC error checking maker funds:',
          err
        );
        return {
          ...bid,
          validationStatus: 'pending' as const,
          validationError: undefined,
        };
      }
    })
  );
}
