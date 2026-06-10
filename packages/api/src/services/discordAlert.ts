/**
 * Discord webhook alerts for new positions.
 *
 * Design constraints:
 * - Fire-and-forget: never blocks the indexer
 * - 5s timeout per webhook call
 * - Skips alerts for old blocks (>5min) to avoid spam on reindex
 */
import { formatUnits } from 'viem';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';

import { createLogger } from '../core/logger';

const log = createLogger('services.discordAlert');

const WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';
const APP_BASE_URL = 'https://sapience.xyz';

const DISCORD_WEBHOOK_URLS: string[] = (process.env.DISCORD_WEBHOOK_URLS || '')
  .split(',')
  .map((u) => u.trim())
  .filter((u) => {
    if (!u) return false;
    if (!u.startsWith(WEBHOOK_PREFIX)) {
      log.warn(
        `[discordAlert] Ignoring invalid webhook URL (must start with ${WEBHOOK_PREFIX})`
      );
      return false;
    }
    return true;
  });

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

export interface SecondaryTradeAlertData {
  seller: string;
  buyer: string;
  token: string;
  tokenAmount: string;
  price: string;
  /** Token decimals for collateral/token formatting (default 18) */
  collateralDecimals?: number;
  tokenDecimals?: number;
  blockTimestamp: number;
  transactionHash: string;
  chainId: number;
  tradeHash?: string;
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

function getExplorerBaseUrl(chainId: number): string {
  return chainId === CHAIN_ID_ETHEREAL
    ? 'https://explorer.ethereal.trade'
    : chainId === CHAIN_ID_ETHEREAL_TESTNET
      ? 'https://explorer.etherealtest.net'
      : chainId === 42161
        ? 'https://arbiscan.io'
        : chainId === 8453
          ? 'https://basescan.org'
          : chainId === 11155111
            ? 'https://sepolia.etherscan.io'
            : 'https://etherscan.io';
}

function buildTransactionField(chainId: number, transactionHash: string) {
  if (!transactionHash) return [];

  return [
    {
      name: '🔗 Transaction',
      value: `[View tx](${getExplorerBaseUrl(chainId)}/tx/${transactionHash})`,
      inline: true,
    },
  ];
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

  const txLink = data.transactionHash
    ? `[View tx](${getExplorerBaseUrl(data.chainId)}/tx/${data.transactionHash})`
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

export function buildSecondaryTradeEmbed(
  data: SecondaryTradeAlertData
): object {
  const collateralDecimals = data.collateralDecimals ?? 18;
  const tokenDecimals = data.tokenDecimals ?? 18;
  const symbol = COLLATERAL_SYMBOLS[data.chainId] ?? 'N/A';

  return {
    title: '🤝 Secondary Sale',
    color: 0x2563eb,
    fields: [
      {
        name: '👤 Seller',
        value: `\`${truncateAddress(data.seller)}\``,
        inline: true,
      },
      {
        name: '🤝 Buyer',
        value: `\`${truncateAddress(data.buyer)}\``,
        inline: true,
      },
      {
        name: '🎟️ Position Tokens',
        value: `${formatCollateral(data.tokenAmount, tokenDecimals)} tokens`,
        inline: true,
      },
      {
        name: '💰 Sale Price',
        value: `${formatCollateral(data.price, collateralDecimals)} ${symbol}`,
        inline: true,
      },
      ...buildTransactionField(data.chainId, data.transactionHash),
    ],
    timestamp: new Date(data.blockTimestamp * 1000).toISOString(),
  };
}

function sendDiscordAlert(
  data: { blockTimestamp: number },
  buildEmbed: () => object
): void {
  // Skip stale blocks (reindex safety)
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - data.blockTimestamp > STALE_BLOCK_THRESHOLD_S) {
    log.debug(
      `[discordAlert] Skipping stale block (age=${nowSec - data.blockTimestamp}s, threshold=${STALE_BLOCK_THRESHOLD_S}s)`
    );
    return;
  }

  // Skip if no webhooks configured
  if (DISCORD_WEBHOOK_URLS.length === 0) return;

  const embed = buildEmbed();
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
              log.error(
                `[discordAlert] Webhook HTTP ${res.status}: ${body.slice(0, 200)}`
              );
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        log.error(
          `[discordAlert] Webhook failed (network):`,
          err?.message || err
        );
      });
  }
}

export function sendPositionAlert(data: PositionAlertData): void {
  sendDiscordAlert(data, () => buildPositionEmbed(data));
}

export function sendSecondaryTradeAlert(data: SecondaryTradeAlertData): void {
  sendDiscordAlert(data, () => buildSecondaryTradeEmbed(data));
}
