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
-- !!      write time (normalizeOutcomeSide in predictionMarketEscrowIndexer). !!
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
-- This migration flips all Pick rows whose Picks record belongs to a V1
-- contract address, so the DB is uniformly in V2 convention. After this,
-- downstream readers (settlement, resolvers, app queries) never need to
-- know about V1.
-- ============================================================================

-- V1 contract addresses (from SDK V1_ESCROW_CONTRACTS registry)
-- Ethereal mainnet:
--   0x8aa92a92436e89cf72e5525a54b64d317919d624
--   0xef6b5c544814a3c5e335b6d2baec6cbde0f97a76
--   0x243022ebf5d66741499d76555cadfde51e101e03
--   0xc18ed3483733d4e15516c2fe101ff20b61e88a55
--   0x23c765fce26adba3a1e0790d548410367d5a3487
-- Ethereal testnet:
--   0x9afaaada6dc3a5013ef6fbaab203a55102e329eb
--   0x3b680e06b9a384179644c1bc7842db67df5fb5f0
--   0x3025c4e3087f33ac04d78ee34f35d4d003c2d642
--   0x7bd9b22f89eca14c5afa4de37ae7b15c80de7a69
--   0x32bf5903ea9c98fb20eb07735a8e62d303b60b3c
--   0xb5d2e6b148ebdfb02a3456f0af021fae81356511
--   0x8730ee1194cd03a14dea9975e2bafd4c8b6019f1

UPDATE "Pick"
SET "predictedOutcome" = CASE
  WHEN "predictedOutcome" = 0 THEN 1  -- V1 YES (0) -> V2 YES (1)
  WHEN "predictedOutcome" = 1 THEN 0  -- V1 NO  (1) -> V2 NO  (0)
  ELSE "predictedOutcome"
END
WHERE "pickConfigId" IN (
  SELECT id FROM "Picks"
  WHERE LOWER("marketAddress") IN (
    -- Ethereal mainnet
    '0x8aa92a92436e89cf72e5525a54b64d317919d624',
    '0xef6b5c544814a3c5e335b6d2baec6cbde0f97a76',
    '0x243022ebf5d66741499d76555cadfde51e101e03',
    '0xc18ed3483733d4e15516c2fe101ff20b61e88a55',
    '0x23c765fce26adba3a1e0790d548410367d5a3487',
    -- Ethereal testnet
    '0x9afaaada6dc3a5013ef6fbaab203a55102e329eb',
    '0x3b680e06b9a384179644c1bc7842db67df5fb5f0',
    '0x3025c4e3087f33ac04d78ee34f35d4d003c2d642',
    '0x7bd9b22f89eca14c5afa4de37ae7b15c80de7a69',
    '0x32bf5903ea9c98fb20eb07735a8e62d303b60b3c',
    '0xb5d2e6b148ebdfb02a3456f0af021fae81356511',
    '0x8730ee1194cd03a14dea9975e2bafd4c8b6019f1'
  )
);
