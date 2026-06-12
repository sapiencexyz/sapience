#!/usr/bin/env node
/**
 * Metadata + tags cron: refresh-metadata → refresh-imminent-tag.
 * These are the only two writers of condition.tags, so they MUST stay in one
 * sequential group — never run them as separate overlapping crons or a
 * stale-read tag write can clobber the other's.
 */
require('./lib/groups').runGroup('metadata-tags');
