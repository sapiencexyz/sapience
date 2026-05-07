import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import { effectiveDeadlineMs } from '~/lib/auction/bidExpiry';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';

export type SelectBestBidResult = {
  bestBid: QuoteBid | null;
  estimateBid: QuoteBid | null;
};

function maxByCollateral(bids: QuoteBid[]): QuoteBid | null {
  if (bids.length === 0) return null;
  return bids.reduce((acc, current) => {
    try {
      return BigInt(current.counterpartyCollateral) >
        BigInt(acc.counterpartyCollateral)
        ? current
        : acc;
    } catch {
      return acc;
    }
  });
}

// Pick the best submittable bid (highest `counterpartyCollateral`) from `validBids`,
// falling back to an "estimate" bid when no regular bid is submittable yet.
// Estimator bids use a sentinel `deadline=1` and are identified by counterparty
// matching `PREFERRED_ESTIMATE_QUOTER`; those bypass the expiry filter.
export function selectBestBid(
  validBids: QuoteBid[],
  nowMs: number
): SelectBestBidResult {
  if (!validBids || validBids.length === 0) {
    return { bestBid: null, estimateBid: null };
  }

  const estimatorAddress = PREFERRED_ESTIMATE_QUOTER.toLowerCase();

  const estimatorBids = validBids.filter(
    (bid) =>
      bid.counterparty?.toLowerCase() === estimatorAddress &&
      bid.validationStatus === 'valid'
  );
  const regularBids = validBids.filter(
    (bid) => bid.counterparty?.toLowerCase() !== estimatorAddress
  );

  const nonExpiredBids = regularBids.filter(
    (bid) => effectiveDeadlineMs(bid.counterpartyDeadline) > nowMs
  );

  if (nonExpiredBids.length === 0 && estimatorBids.length === 0) {
    return { bestBid: null, estimateBid: null };
  }

  const validFilteredBids = nonExpiredBids.filter(
    (bid) => bid.validationStatus === 'valid'
  );
  const failedBids = nonExpiredBids.filter(
    (bid) => bid.validationStatus === 'invalid'
  );

  if (validFilteredBids.length === 0) {
    // No submittable bids — surface best estimator, else a single failed bid as estimate.
    const bestEstimator = maxByCollateral(estimatorBids);
    const estimateFromFailed = failedBids.length === 1 ? failedBids[0] : null;
    return {
      bestBid: null,
      estimateBid: bestEstimator ?? estimateFromFailed,
    };
  }

  return {
    bestBid: maxByCollateral(validFilteredBids),
    estimateBid: null,
  };
}
