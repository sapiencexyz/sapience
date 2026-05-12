/**
 * Discord webhook notifications for user-submitted market requests.
 *
 * When a user searches for a ticker/market that isn't listed yet, the app lets
 * them request it. Each request is posted to a Discord channel so the team can
 * triage and list it.
 *
 * Design constraints (mirrors `discordAlert`):
 * - Fire-and-forget: never blocks the request handler
 * - 5s timeout per webhook call
 * - Rate limited: max 20 requests per 60s window (global, best-effort)
 */
import { createLogger } from '../core/logger';

const log = createLogger('services.marketRequestAlert');

const WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';

/**
 * Dedicated webhook for market requests. Falls back to the first configured
 * position-alert webhook so a single env var is enough in simple deployments.
 */
const MARKET_REQUEST_WEBHOOK_URLS: string[] = (
  process.env.DISCORD_MARKET_REQUEST_WEBHOOK_URL ||
  process.env.DISCORD_WEBHOOK_URLS ||
  ''
)
  .split(',')
  .map((u) => u.trim())
  .filter((u) => {
    if (!u) return false;
    if (!u.startsWith(WEBHOOK_PREFIX)) {
      log.warn(
        `[marketRequestAlert] Ignoring invalid webhook URL (must start with ${WEBHOOK_PREFIX})`
      );
      return false;
    }
    return true;
  });

// Rate limiting state (best-effort, per-process)
const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

export const MAX_TICKER_LENGTH = 64;
export const MAX_NOTE_LENGTH = 280;

export interface MarketRequestData {
  /** Free-text ticker / market name the user searched for */
  ticker: string;
  /** Optional Polymarket URL the user supplied so we can mirror the exact market */
  polymarketUrl?: string | null;
  /** Optional note from the user */
  note?: string | null;
  /** Optional wallet address of the requester */
  walletAddress?: string | null;
}

function isRateLimited(): boolean {
  const now = Date.now();
  while (
    requestTimestamps.length > 0 &&
    requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length >= RATE_LIMIT_MAX;
}

function recordRequest(): void {
  requestTimestamps.push(Date.now());
}

/** Reset rate limiter state (for testing only). */
export function _resetRateLimiter(): void {
  requestTimestamps.length = 0;
}

/** True when at least one valid webhook URL is configured. */
export function hasMarketRequestWebhook(): boolean {
  return MARKET_REQUEST_WEBHOOK_URLS.length > 0;
}

/**
 * Build the Discord embed payload for a market request.
 * Exported for testing.
 */
export function buildMarketRequestEmbed(data: MarketRequestData): object {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (data.polymarketUrl) {
    fields.push({
      name: '🔗 Polymarket',
      value: data.polymarketUrl,
      inline: false,
    });
  }
  if (data.note) {
    fields.push({ name: '📝 Note', value: data.note, inline: false });
  }
  if (data.walletAddress) {
    fields.push({
      name: '👤 Requested by',
      value: `\`${data.walletAddress}\``,
      inline: false,
    });
  }

  return {
    title: '🆕 Market Request',
    description: `**${data.ticker}**`,
    color: 0x7c3aed,
    fields,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a market request notification to Discord. Fire-and-forget.
 * Returns `true` if the request was accepted for delivery, `false` if it was
 * dropped (no webhook configured or rate limited).
 */
export function sendMarketRequestAlert(data: MarketRequestData): boolean {
  if (MARKET_REQUEST_WEBHOOK_URLS.length === 0) return false;

  if (isRateLimited()) {
    log.warn('[marketRequestAlert] Rate limited, dropping market request');
    return false;
  }

  recordRequest();

  const embed = buildMarketRequestEmbed(data);
  const payload = JSON.stringify({ embeds: [embed] });

  for (const url of MARKET_REQUEST_WEBHOOK_URLS) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    })
      .then((res) => {
        if (!res.ok) {
          res
            .text()
            .then((body) => {
              log.error(
                `[marketRequestAlert] Webhook HTTP ${res.status}: ${body.slice(0, 200)}`
              );
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        log.error(
          `[marketRequestAlert] Webhook failed (network):`,
          err?.message || err
        );
      });
  }

  return true;
}
