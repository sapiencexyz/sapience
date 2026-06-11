-- Materialized top-N tag list for Query.popularTags. The resolver
-- previously ran an `unnest(tags)` aggregation across every public
-- condition on each cache miss (O(public-conditions) full scan); this
-- table is refreshed by the keeper on the same cadence as
-- condition_group aggregates so the resolver becomes a 20-row index
-- read.

CREATE TABLE IF NOT EXISTS "popular_tag" (
    "tag"         VARCHAR PRIMARY KEY,
    "rank"        INTEGER NOT NULL,
    "count"       INTEGER NOT NULL,
    "refreshedAt" TIMESTAMP(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "popular_tag_rank_idx"
ON "popular_tag" ("rank");
