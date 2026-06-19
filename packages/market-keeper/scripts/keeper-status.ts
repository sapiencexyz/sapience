#!/usr/bin/env node
/**
 * Keeper heartbeat: reads the balances the keeper depends on and posts them to
 * the Discord webhook (DISCORD_KEEPER_WEBHOOK), escalating to a LOW alert when
 * a balance falls below its threshold.
 *
 *   - OpenRouter credits   (OPENROUTER_API_KEY)
 *   - Admin wallet POL     (POLYGON_RPC_URL + ADMIN_PRIVATE_KEY)
 *
 * Intended to run as its own Railway cron (e.g. hourly): `pnpm start:status`.
 *
 * Thresholds (USD credits / POL):
 *   OPENROUTER_MIN_CREDITS   default 10
 *   ADMIN_MIN_POL            default 5
 */
import 'dotenv/config';
import {
  fetchOpenRouterBalance,
  fetchPolBalance,
  classifyBalances,
} from '../src/notify/balances.js';
import { buildHeartbeatEmbed } from '../src/notify/embeds.js';
import { postKeeperEmbeds } from '../src/notify/discord.js';
import { log, logError, logSeparator } from '../src/utils/log.js';
import type { BalanceReport } from '../src/notify/types.js';

const DEFAULT_OPENROUTER_MIN_CREDITS = 10;
const DEFAULT_ADMIN_MIN_POL = 5;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  const report: BalanceReport = {};

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      report.openrouter = await fetchOpenRouterBalance(openrouterKey);
    } catch (e) {
      report.openrouterError = errMsg(e);
      logError(
        '[keeper-status] OpenRouter balance failed:',
        report.openrouterError
      );
    }
  } else {
    report.openrouterError = 'OPENROUTER_API_KEY not set';
  }

  const rpcUrl = process.env.POLYGON_RPC_URL;
  const adminKey = process.env.ADMIN_PRIVATE_KEY;
  if (rpcUrl && adminKey) {
    try {
      report.pol = await fetchPolBalance(rpcUrl, adminKey);
    } catch (e) {
      report.polError = errMsg(e);
      logError('[keeper-status] POL balance failed:', report.polError);
    }
  } else {
    report.polError = 'POLYGON_RPC_URL or ADMIN_PRIVATE_KEY not set';
  }

  const thresholds = {
    openrouterMinCredits: numEnv(
      'OPENROUTER_MIN_CREDITS',
      DEFAULT_OPENROUTER_MIN_CREDITS
    ),
    adminMinPol: numEnv('ADMIN_MIN_POL', DEFAULT_ADMIN_MIN_POL),
  };
  const cls = classifyBalances(report, thresholds);

  log(
    `[keeper-status] OpenRouter remaining: ${
      report.openrouter
        ? `$${report.openrouter.remaining.toFixed(2)}`
        : report.openrouterError
    }`
  );
  log(
    `[keeper-status] Admin POL: ${
      report.pol ? report.pol.pol.toFixed(3) : report.polError
    }`
  );
  if (cls.anyLow) {
    logError(
      `[keeper-status] LOW BALANCE: openrouterLow=${cls.openrouterLow} polLow=${cls.polLow}`
    );
  }

  await postKeeperEmbeds([buildHeartbeatEmbed(report, cls)]);
}

logSeparator('keeper-status', 'START');
main()
  .catch((e) => {
    logError('[keeper-status] fatal:', errMsg(e));
    process.exit(1);
  })
  .finally(() => logSeparator('keeper-status', 'END'));
