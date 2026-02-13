/**
 * Discord webhook alerts for new positions.
 *
 * Design constraints:
 * - Fire-and-forget: never blocks the indexer
 * - 5s timeout per webhook call
 * - Skips alerts for old blocks (>5min) to avoid spam on reindex
 * - Rate limited: max 10 alerts per 60s window
 */

const DISCORD_WEBHOOK_URLS: string[] = (process.env.DISCORD_WEBHOOK_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

// Rate limiting state
const alertTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// Staleness threshold: skip alerts for blocks older than 5 minutes.
// This prevents flooding Discord when reindexing historical blocks.
const STALE_BLOCK_THRESHOLD_S = 5 * 60;

interface PositionAlertData {
  predictor: string;
  counterparty: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  totalCollateral: string;
  predictions: Array<{
    conditionId: string;
    question: string;
    outcomeYes: boolean;
  }>;
  blockTimestamp: number;
  transactionHash: string;
  chainId: number;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatCollateral(raw: string): string {
  // Collateral is in wei (18 decimals for testUSDe / USDe)
  const n = Number(raw) / 1e18;
  if (n === 0) return '0';
  if (n < 0.01) return '<0.01';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function isRateLimited(): boolean {
  const now = Date.now();
  // Prune old timestamps
  while (
    alertTimestamps.length > 0 &&
    alertTimestamps[0] < now - RATE_LIMIT_WINDOW_MS
  ) {
    alertTimestamps.shift();
  }
  return alertTimestamps.length >= RATE_LIMIT_MAX;
}

function recordAlert(): void {
  alertTimestamps.push(Date.now());
}

export function sendPositionAlert(data: PositionAlertData): void {
  // Skip stale blocks (reindex safety)
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - data.blockTimestamp > STALE_BLOCK_THRESHOLD_S) {
    return;
  }

  // Skip if no webhooks configured
  if (DISCORD_WEBHOOK_URLS.length === 0) return;

  // Rate limit check
  if (isRateLimited()) {
    console.warn('[discordAlert] Rate limited, skipping position alert');
    return;
  }

  recordAlert();

  const predictionsText = data.predictions
    .map((p) => `• ${p.question} → **${p.outcomeYes ? 'YES' : 'NO'}**`)
    .join('\n');

  const embed = {
    title: '🔮 New Position',
    color: 0x7c3aed, // Purple
    fields: [
      {
        name: '📋 Predictions',
        value: predictionsText || '_No predictions decoded_',
        inline: false,
      },
      {
        name: '👤 Predictor',
        value: `\`${truncateAddress(data.predictor)}\` (${formatCollateral(data.predictorCollateral)} USDe)`,
        inline: true,
      },
      {
        name: '🤝 Counterparty',
        value: `\`${truncateAddress(data.counterparty)}\` (${formatCollateral(data.counterpartyCollateral)} USDe)`,
        inline: true,
      },
      {
        name: '💰 Total',
        value: `${formatCollateral(data.totalCollateral)} USDe`,
        inline: true,
      },
    ],
    timestamp: new Date(data.blockTimestamp * 1000).toISOString(),
  };

  const payload = JSON.stringify({ embeds: [embed] });

  // Fire-and-forget: send to all webhook URLs
  for (const url of DISCORD_WEBHOOK_URLS) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.error('[discordAlert] Webhook failed:', err?.message || err);
    });
  }
}
