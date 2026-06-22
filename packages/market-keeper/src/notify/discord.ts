/**
 * Send embeds to the keeper Discord webhook (DISCORD_KEEPER_WEBHOOK).
 *
 * Unlike the indexer's fire-and-forget alerts, these calls are awaited: the
 * keeper subservices/runner are short-lived processes that exit immediately
 * after posting, so we must let the request finish (≤5s) before the process
 * dies. The call still never throws.
 */
import { log, logError } from '../utils/log';

const WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';
const TIMEOUT_MS = 5_000;

/**
 * Environment label stamped on every alert so prod/staging/dev alerts are
 * distinguishable in a shared channel.
 *
 * NODE_ENV alone is insufficient: staging runs the production build, so it's
 * `production` on both staging and prod. Resolution order:
 *   1. KEEPER_ENV            — explicit override (set per deploy if you want a
 *                              specific label)
 *   2. RAILWAY_ENVIRONMENT_NAME — auto-injected by Railway per environment
 *                              (e.g. 'production' vs 'staging'); no config
 *   3. NODE_ENV              — local / non-Railway fallback
 *   4. 'development'         — nothing set
 */
export function keeperEnv(): string {
  return (
    process.env.KEEPER_ENV ||
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.NODE_ENV ||
    'development'
  );
}

/** Resolve + validate the configured webhook URL, or null when unusable. */
export function getKeeperWebhook(): string | null {
  const url = (process.env.DISCORD_KEEPER_WEBHOOK || '').trim();
  if (!url) return null;
  if (!url.startsWith(WEBHOOK_PREFIX)) {
    logError(
      `[keeperDiscord] Ignoring invalid DISCORD_KEEPER_WEBHOOK (must start with ${WEBHOOK_PREFIX})`
    );
    return null;
  }
  return url;
}

/** POST embeds to the keeper webhook. Awaits delivery (≤5s). Never throws. */
export async function postKeeperEmbeds(embeds: object[]): Promise<void> {
  const url = getKeeperWebhook();
  if (!url) {
    log('[keeperDiscord] DISCORD_KEEPER_WEBHOOK not set — skipping post');
    return;
  }
  if (embeds.length === 0) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logError(
        `[keeperDiscord] Webhook HTTP ${res.status}: ${body.slice(0, 200)}`
      );
    }
  } catch (err) {
    logError(
      '[keeperDiscord] Webhook failed:',
      err instanceof Error ? err.message : err
    );
  }
}
