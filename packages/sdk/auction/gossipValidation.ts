/**
 * Lightweight, synchronous payload validation for gossip messages.
 *
 * These checks are structural only — no crypto, no RPC, no async.
 * They prevent malformed or obviously invalid payloads from reaching
 * application handlers via the peer mesh.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isAddress(v: unknown): v is string {
  return typeof v === 'string' && ADDRESS_RE.test(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPickJson(p: unknown): boolean {
  if (typeof p !== 'object' || p === null) return false;
  const pick = p as Record<string, unknown>;
  return (
    isAddress(pick.conditionResolver) &&
    typeof pick.conditionId === 'string' &&
    /^0x[a-fA-F0-9]+$/.test(pick.conditionId) &&
    pick.conditionId.length >= 66 &&
    (pick.predictedOutcome === 0 || pick.predictedOutcome === 1)
  );
}

function hasValidPicks(payload: Record<string, unknown>): boolean {
  return (
    Array.isArray(payload.picks) &&
    payload.picks.length > 0 &&
    payload.picks.every(isPickJson)
  );
}

/**
 * Validates the structural shape of a gossip payload for known message types.
 * Returns true if the payload is well-formed, false if it should be dropped.
 *
 * Unknown message types return false (deny by default).
 */
export function isValidGossipPayload(type: string, payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;

  switch (type) {
    case 'auction.start':
      return (
        hasValidPicks(p) &&
        isAddress(p.predictor) &&
        isNonEmptyString(p.predictorCollateral) &&
        isFiniteNumber(p.chainId) &&
        p.chainId > 0
      );

    case 'auction.started':
      return (
        isNonEmptyString(p.auctionId) &&
        hasValidPicks(p) &&
        isAddress(p.predictor) &&
        isNonEmptyString(p.predictorCollateral) &&
        isFiniteNumber(p.chainId) &&
        p.chainId > 0
      );

    case 'auction.bids':
      return (
        isNonEmptyString(p.auctionId) &&
        Array.isArray(p.bids) &&
        p.bids.every((b: unknown) => {
          if (typeof b !== 'object' || b === null) return false;
          const bid = b as Record<string, unknown>;
          return (
            isNonEmptyString(bid.auctionId) &&
            isAddress(bid.counterparty) &&
            isNonEmptyString(bid.counterpartyCollateral)
          );
        })
      );

    case 'bid.submit':
      return (
        isNonEmptyString(p.auctionId) &&
        isAddress(p.counterparty) &&
        isNonEmptyString(p.counterpartyCollateral)
      );

    case 'bid.ack':
      // Ack messages are lightweight — just need to be objects
      return true;

    case 'auction.filled':
      return (
        isNonEmptyString(p.auctionId) && isNonEmptyString(p.transactionHash)
      );

    case 'auction.expired':
      return isNonEmptyString(p.auctionId) && isNonEmptyString(p.reason);

    case 'vault_quote.update':
      return (
        isAddress(p.vaultAddress) && isFiniteNumber(p.chainId) && p.chainId > 0
      );

    case 'order.created':
      // Loose — just require it's an object with an id or auctionId
      return isNonEmptyString(p.id) || isNonEmptyString(p.auctionId);

    default:
      return false;
  }
}
