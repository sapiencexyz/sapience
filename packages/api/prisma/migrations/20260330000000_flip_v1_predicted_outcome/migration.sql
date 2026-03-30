-- ============================================================================
-- DEPLOYMENT ORDER — READ THIS BEFORE RUNNING
-- ============================================================================
--
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- !!                                                                          !!
-- !!   THIS MIGRATION MUST BE DEPLOYED WITH A SPECIFIC SEQUENCE TO PREVENT    !!
-- !!   DATA CORRUPTION. DO NOT RUN THIS IN ISOLATION.                         !!
-- !!                                                                          !!
-- !!   1. TURN OFF ALL INDEXERS                                               !!
-- !!      Stop all running indexer processes. If indexers write while this     !!
-- !!      migration runs, V1 events will be stored with the old encoding      !!
-- !!      and then double-flipped (or not flipped at all).                    !!
-- !!                                                                          !!
-- !!   2. RUN THIS DB MIGRATION                                              !!
-- !!      Flips predictedOutcome for all existing V1 (legacy) picks:          !!
-- !!      0 (old YES) -> 1 (new YES), 1 (old NO) -> 0 (new NO).             !!
-- !!                                                                          !!
-- !!   3. UPDATE INDEXER CODE                                                 !!
-- !!      Deploy the new indexer code that normalizes V1 outcomes at          !!
-- !!      write time (the isLegacy flip in predictionMarketEscrowIndexer).    !!
-- !!                                                                          !!
-- !!   4. TURN ON INDEXERS AGAIN                                              !!
-- !!      Indexers will now write V2-convention values for both V1 and V2     !!
-- !!      contracts. The DB invariant is: predictedOutcome always uses        !!
-- !!      V2 encoding (NO=0, YES=1).                                         !!
-- !!                                                                          !!
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
--
-- Background:
-- V1 contracts encode OutcomeSide as YES=0, NO=1.
-- V2 contracts (and the new canonical enum) use NO=0, YES=1.
-- This migration flips all Pick rows that belong to legacy (V1) Picks records
-- so the DB is uniformly in V2 convention. After this, downstream readers
-- (settlement, resolvers, app queries) never need to know about V1.
-- ============================================================================

-- Flip predictedOutcome for all picks belonging to legacy pick configs.
-- Uses a temporary value of 99 to avoid 0->1 then 1->0 collision.
UPDATE "Pick"
SET "predictedOutcome" = CASE
  WHEN "predictedOutcome" = 0 THEN 1  -- V1 YES (0) -> V2 YES (1)
  WHEN "predictedOutcome" = 1 THEN 0  -- V1 NO  (1) -> V2 NO  (0)
  ELSE "predictedOutcome"
END
WHERE "pickConfigId" IN (
  SELECT id FROM "Picks" WHERE "isLegacy" = true
);
