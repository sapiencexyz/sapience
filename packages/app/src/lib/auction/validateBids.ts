import { getAddress } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Lightweight bid validity check for `/markets`.
 *
 * We intentionally do NOT do on-chain simulation and do NOT verify signatures here.
 * We only require a non-zero maker address so the UI can treat the bid as present/usable.
 */
export function validateBids(bids: QuoteBid[]): QuoteBid[] {
  return bids.map((bid) => {
    try {
      const makerAddr = getAddress(bid.maker as `0x${string}`);
      if (makerAddr.toLowerCase() === ZERO_ADDRESS) {
        return {
          ...bid,
          validationStatus: 'invalid' as const,
          validationError: 'Missing maker (zero address)',
        };
      }
      return {
        ...bid,
        validationStatus: 'valid' as const,
        validationError: undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Invalid maker address`;
      return {
        ...bid,
        validationStatus: 'invalid' as const,
        validationError: msg,
      };
    }
  });
}
