#!/usr/bin/env node
/**
 * Discovery cron: create new Sapience conditions from Polymarket markets.
 * generate → relist. Create-only — touches no existing tags, so it carries no
 * tag-write race and can run more often than the heavy metadata-tags sweep.
 */
require('./lib/groups').runGroup('discovery');
