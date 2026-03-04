-- Fix openInterest: reset to correct values calculated from unsettled positions
-- Fix predictionCount: backfill V2 prediction counts

-- Step 1: Zero out all OI (will be recalculated from active positions)
UPDATE condition SET "openInterest" = '0';

-- Step 2: Add V1 unsettled legacy positions' collateral to OI
-- LegacyPrediction is @@map("prediction"), LegacyPosition is @@map("position")
UPDATE condition c
SET "openInterest" = (COALESCE(c."openInterest"::NUMERIC, 0) + sub.oi)::TEXT
FROM (
  SELECT lp."conditionId", SUM(p."totalCollateral"::NUMERIC) as oi
  FROM prediction lp
  JOIN position p ON p.id = lp."positionId"
  WHERE p.status = 'active'
  GROUP BY lp."conditionId"
) sub
WHERE c.id = sub."conditionId";

-- Step 3: Add V2 unsettled predictions' collateral to OI
-- Use AND to match both token addresses (avoids cross-join inflation from OR)
UPDATE condition c
SET "openInterest" = (COALESCE(c."openInterest"::NUMERIC, 0) + sub.oi)::TEXT
FROM (
  SELECT pk."conditionId",
    SUM(pred."predictorCollateral"::NUMERIC + pred."counterpartyCollateral"::NUMERIC) as oi
  FROM "Pick" pk
  JOIN "Picks" pc ON pc.id = pk."pickConfigId"
  JOIN "Prediction" pred ON (
    pred."predictorToken" = pc."predictorToken"
    AND pred."counterpartyToken" = pc."counterpartyToken"
  )
  WHERE pred.settled = false
  GROUP BY pk."conditionId"
) sub
WHERE c.id = sub."conditionId";

-- Step 4: Backfill V2 prediction counts
-- The existing trigger covers V1 (prediction table), so only add V2 counts
-- Use AND to match both token addresses (avoids cross-join inflation from OR)
UPDATE condition c
SET "predictionCount" = c."predictionCount" + sub.cnt
FROM (
  SELECT pk."conditionId", COUNT(DISTINCT pred.id)::integer AS cnt
  FROM "Pick" pk
  JOIN "Picks" pc ON pc.id = pk."pickConfigId"
  JOIN "Prediction" pred ON (
    pred."predictorToken" = pc."predictorToken"
    AND pred."counterpartyToken" = pc."counterpartyToken"
  )
  GROUP BY pk."conditionId"
) sub
WHERE c.id = sub."conditionId";
