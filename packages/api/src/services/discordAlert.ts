/**
 * Discord webhook alerts for new positions.
 *
 * Design constraints:
 * - Fire-and-forget: never blocks the indexer
 * - 5s timeout per webhook call
 * - Skips alerts for old blocks (>5min) to avoid spam on reindex
 * - Rate limited: max 10 alerts per 60s window
 */
import { formatUnits } from 'viem';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';

const WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';
const APP_BASE_URL = 'https://sapience.xyz';

const DISCORD_WEBHOOK_URLS: string[] = (process.env.DISCORD_WEBHOOK_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter((u) => {
    if (!u) return false;
    if (!u.startsWith(WEBHOOK_PREFIX)) {
      console.warn(
        `[discordAlert] Ignoring invalid webhook URL (must start with ${WEBHOOK_PREFIX})`
      );
      return false;
    }
    return true;
  });

// Rate limiting state
const alertTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// Staleness threshold: skip alerts for blocks older than 5 minutes.
// This prevents flooding Discord when reindexing historical blocks.
export const STALE_BLOCK_THRESHOLD_S = 5 * 60;

export interface PositionAlertData {
  predictor: string;
  counterparty: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  totalCollateral: string;
  /** Token decimals for collateral formatting (default 18) */
  collateralDecimals?: number;
  predictions: Array<{
    conditionId: string;
    question: string;
    outcomeYes: boolean;
  }>;
  blockTimestamp: number;
  transactionHash: string;
  chainId: number;
  /** Prediction ID for linking to the position page */
  predictionId?: string;
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatCollateral(raw: string, decimals: number = 18): string {
  try {
    const formatted = formatUnits(BigInt(raw), decimals);
    const n = parseFloat(formatted);
    if (n === 0) return '0';
    if (n < 0.01) return '<0.01';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    return raw;
  }
}

export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return 'Ethereum';
    case 42161:
      return 'Arbitrum';
    case 8453:
      return 'Base';
    case 11155111:
      return 'Sepolia';
    case CHAIN_ID_ETHEREAL:
      return 'Ethereal';
    case CHAIN_ID_ETHEREAL_TESTNET:
      return 'Ethereal Testnet';
    default:
      return `Chain ${chainId}`;
  }
}

function isRateLimited(): boolean {
  const now = Date.now();
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

/**
 * Build the Discord embed payload for a position alert.
 * Exported for testing — sendPositionAlert calls this internally.
 */
export function buildPositionEmbed(data: PositionAlertData): object {
  const decimals = data.collateralDecimals ?? 18;
  const symbol = COLLATERAL_SYMBOLS[data.chainId] ?? 'N/A';

  const predictionsText = data.predictions
    .map((p) => `• ${p.question} → **${p.outcomeYes ? 'YES' : 'NO'}**`)
    .join('\n');

  const explorerBaseUrl =
    data.chainId === CHAIN_ID_ETHEREAL
      ? 'https://explorer.ethereal.trade'
      : data.chainId === CHAIN_ID_ETHEREAL_TESTNET
        ? 'https://explorer.etherealtest.net'
        : data.chainId === 42161
          ? 'https://arbiscan.io'
          : data.chainId === 8453
            ? 'https://basescan.org'
            : data.chainId === 11155111
              ? 'https://sepolia.etherscan.io'
              : 'https://etherscan.io';

  const txLink = data.transactionHash
    ? `[View tx](${explorerBaseUrl}/tx/${data.transactionHash})`
    : '';

  return {
    title: '🔮 New Position',
    color: 0x7c3aed,
    fields: [
      {
        name: '📋 Predictions',
        value: predictionsText || '_No predictions decoded_',
        inline: false,
      },
      {
        name: '👤 Predictor',
        value: `\`${truncateAddress(data.predictor)}\` (${formatCollateral(data.predictorCollateral, decimals)} ${symbol})`,
        inline: true,
      },
      {
        name: '🤝 Counterparty',
        value: `\`${truncateAddress(data.counterparty)}\` (${formatCollateral(data.counterpartyCollateral, decimals)} ${symbol})`,
        inline: true,
      },
      {
        name: '💰 Total',
        value: `${formatCollateral(data.totalCollateral, decimals)} ${symbol}`,
        inline: true,
      },
      ...(data.predictionId
        ? [
            {
              name: '📄 Position',
              value: `[View Position](${APP_BASE_URL}/predictions/${data.predictionId})`,
              inline: true,
            },
          ]
        : []),
      ...(txLink
        ? [
            {
              name: '🔗 Transaction',
              value: txLink,
              inline: true,
            },
          ]
        : []),
    ],
    timestamp: new Date(data.blockTimestamp * 1000).toISOString(),
  };
}

/** Reset rate limiter state (for testing only). */
export function _resetRateLimiter(): void {
  alertTimestamps.length = 0;
}

export function sendPositionAlert(data: PositionAlertData): void {
  // Skip stale blocks (reindex safety)
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - data.blockTimestamp > STALE_BLOCK_THRESHOLD_S) {
    console.debug(
      `[discordAlert] Skipping stale block (age=${nowSec - data.blockTimestamp}s, threshold=${STALE_BLOCK_THRESHOLD_S}s)`
    );
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

  const embed = buildPositionEmbed(data);
  const payload = JSON.stringify({ embeds: [embed] });

  // Fire-and-forget: send to all webhook URLs
  for (const url of DISCORD_WEBHOOK_URLS) {
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
              console.error(
                `[discordAlert] Webhook HTTP ${res.status}: ${body.slice(0, 200)}`
              );
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        console.error(
          `[discordAlert] Webhook failed (network):`,
          err?.message || err
        );
      });
  }
}
