/**
 * Per-(auctionId, clientId) record of which clients the relayer attempted to
 * deliver `auction.started` to. Used to gate `auction.received` acks so a
 * malicious or buggy WS client can't fabricate proof-of-delivery for an
 * auction it never received.
 *
 * In-memory and process-local — same scope as the escrow auction registry.
 * Memory bound: <connections> * <auctions in TTL window>, both small.
 */

const TTL_MS = 90_000; // a bit over the 60s auction TTL to tolerate late acks
const SWEEP_INTERVAL_MS = 30_000;

const ledger = new Map<string, Map<string, number>>();

export function recordBroadcast(auctionId: string, clientId: string): void {
  let inner = ledger.get(auctionId);
  if (!inner) {
    inner = new Map();
    ledger.set(auctionId, inner);
  }
  inner.set(clientId, Date.now());
}

export function wasBroadcastTo(auctionId: string, clientId: string): boolean {
  return ledger.get(auctionId)?.has(clientId) ?? false;
}

/** Test-only — never call from production code. */
export function _resetBroadcastLedgerForTests(): void {
  ledger.clear();
}

setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [auctionId, inner] of ledger) {
    for (const [clientId, ts] of inner) {
      if (ts < cutoff) inner.delete(clientId);
    }
    if (inner.size === 0) ledger.delete(auctionId);
  }
}, SWEEP_INTERVAL_MS).unref?.();
