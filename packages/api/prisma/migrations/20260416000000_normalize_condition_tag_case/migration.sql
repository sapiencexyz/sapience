-- Normalize tag case: capitalize the first character of every tag label,
-- preserving the rest (so acronyms like "UFC" stay intact and labels that
-- Polymarket returns miscased, e.g. "temperature", become "Temperature").
UPDATE "condition"
SET "tags" = sub.normalized
FROM (
  SELECT
    "id",
    ARRAY(
      SELECT UPPER(LEFT(t, 1)) || SUBSTRING(t FROM 2)
      FROM unnest("tags") AS t
      WHERE t IS NOT NULL AND t <> ''
    ) AS normalized
  FROM "condition"
  WHERE array_length("tags", 1) > 0
) AS sub
WHERE "condition"."id" = sub."id"
  AND "condition"."tags" IS DISTINCT FROM sub.normalized;
