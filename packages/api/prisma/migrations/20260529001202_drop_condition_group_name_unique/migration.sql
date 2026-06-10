-- Drop the UNIQUE constraint on condition_group.name.
--
-- Until now, group identity has been name-keyed: the admin route does
-- findFirst({name}) and the DB enforces "one group per name." That's the
-- root cause of the name-collapse bug — Polymarket creates a new event each
-- week with the same human-readable title ("Top US Netflix Movie This
-- Week", "Pacers vs. Wizards", etc.), and Sapience folds all of them into
-- a single group.
--
-- This migration accompanies the admin-route refactor that switches group
-- identity to (source, externalEventId) — see
-- packages/api/src/routes/conditions.ts and the helper at
-- packages/api/src/routes/helpers/conditionGroupIdentity.ts. Going forward,
-- a fresh group is created per Polymarket event id and display names are
-- free to collide.
--
-- The partial UNIQUE index on (source, externalEventId) — added by
-- 20260526232237_add_condition_group_event_identity — is the new canonical
-- identity constraint for platform-sourced groups.

DROP INDEX "condition_group_name_key";

-- Keep a non-unique btree index for the legacy name-fallback path. The
-- helper still does findFirst({name}) for non-Polymarket / curated groups
-- whose payloads don't carry externalEventId. Without an index this
-- becomes a sequential scan on every legacy admin write.
CREATE INDEX "IDX_condition_group_name" ON "condition_group"("name");
