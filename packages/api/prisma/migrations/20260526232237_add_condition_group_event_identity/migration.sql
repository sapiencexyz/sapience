-- Future-proof condition_group identity: add a (source, externalEventId)
-- shape so we can later switch the keeper from name-keyed lookups (which
-- silently collapse weekly Polymarket events into a single group — see the
-- backfill investigation in scripts/investigateEventGrouping.ts) to
-- event-keyed lookups.
--
-- Backwards-compatible by design: the existing UNIQUE("name") constraint
-- stays in place, and `source`/`externalEventId` are populated by a
-- separate backfill script. Application code keeps treating
-- `source = 'polymarket'` as implicit until a follow-up PR switches the
-- keeper to read the new identity. See
-- scripts/backfillConditionGroupEvent.ts for the data fill.

ALTER TABLE "condition_group"
  ADD COLUMN "source" VARCHAR NOT NULL DEFAULT 'polymarket',
  ADD COLUMN "externalEventId" VARCHAR;

-- Partial uniqueness — the canonical identity for platform-sourced groups.
-- NULL externalEventId is allowed for legacy / Sapience-native / curated
-- groups and intentionally falls outside this index (Postgres treats NULL
-- as distinct, so multiple NULL rows coexist without colliding here).
CREATE UNIQUE INDEX "uq_condition_group_source_event"
  ON "condition_group" ("source", "externalEventId")
  WHERE "externalEventId" IS NOT NULL;
