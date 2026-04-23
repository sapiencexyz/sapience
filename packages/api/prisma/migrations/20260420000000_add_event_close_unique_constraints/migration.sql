-- Add unique constraints for indexer idempotency.
--
-- Motivation: The Background Worker and the Reconciler can process the same
-- on-chain event concurrently. Handlers that did relative arithmetic
-- (openInterest += / -=, balance += / -=) drifted silently because nothing
-- stopped a duplicate run from double-counting. These unique constraints
-- turn handler-gate writes (Event.create, Close.create) into atomic
-- idempotency barriers: a duplicate insert throws P2002 and the handler
-- skips the side effect.

-- ─── Event: dedupe existing duplicates then add unique (txHash, logIndex) ──────

DELETE FROM "event"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "event"
  GROUP BY "transactionHash", "logIndex"
);

CREATE UNIQUE INDEX "UQ_event_txhash_logindex"
  ON "event" ("transactionHash", "logIndex");

-- ─── Close: dedupe existing duplicates then add unique (chainId, txHash, pickConfigId) ────

DELETE FROM "Close"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "Close"
  GROUP BY "chainId", "txHash", "pickConfigId"
);

CREATE UNIQUE INDEX "UQ_close_chain_tx_pickconfig"
  ON "Close" ("chainId", "txHash", "pickConfigId");
