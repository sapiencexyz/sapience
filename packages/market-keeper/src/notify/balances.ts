/**
 * Balance lookups + threshold classification for the keeper heartbeat.
 *
 *  - OpenRouter credits via the public credits/key endpoints
 *  - Admin wallet POL balance on Polygon (the wallet that pays LayerZero/POL
 *    fees for resolution requests), derived from ADMIN_PRIVATE_KEY
 */
import {
  createPublicClient,
  http,
  formatEther,
  type Hex,
  type PublicClient,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  OpenRouterBalance,
  PolBalance,
  BalanceReport,
  BalanceThresholds,
  BalanceClassification,
} from './types';

const OPENROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key';
const FETCH_TIMEOUT_MS = 10_000;

function numberOrUndefined(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Fetch OpenRouter credit balance.
 *
 * `/api/v1/credits` returns `{ data: { total_credits, total_usage } }`; the
 * remaining balance is `total_credits - total_usage`. We additionally pull
 * burn-rate context (daily/weekly/monthly usage) from `/api/v1/key` on a
 * best-effort basis — a failure there does not fail the call.
 */
export async function fetchOpenRouterBalance(
  apiKey: string
): Promise<OpenRouterBalance> {
  const headers = { Authorization: `Bearer ${apiKey}` };

  const creditsRes = await fetch(OPENROUTER_CREDITS_URL, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!creditsRes.ok) {
    throw new Error(`OpenRouter /credits HTTP ${creditsRes.status}`);
  }
  const creditsJson = (await creditsRes.json()) as {
    data?: { total_credits?: number; total_usage?: number };
  };
  const totalCredits = Number(creditsJson?.data?.total_credits ?? 0);
  const totalUsage = Number(creditsJson?.data?.total_usage ?? 0);

  const balance: OpenRouterBalance = {
    totalCredits,
    totalUsage,
    remaining: totalCredits - totalUsage,
  };

  try {
    const keyRes = await fetch(OPENROUTER_KEY_URL, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (keyRes.ok) {
      const keyJson = (await keyRes.json()) as {
        data?: {
          usage_daily?: number;
          usage_weekly?: number;
          usage_monthly?: number;
        };
      };
      const d = keyJson?.data ?? {};
      balance.usageDaily = numberOrUndefined(d.usage_daily);
      balance.usageWeekly = numberOrUndefined(d.usage_weekly);
      balance.usageMonthly = numberOrUndefined(d.usage_monthly);
    }
  } catch {
    // burn-rate enrichment is optional
  }

  return balance;
}

/** Read the admin wallet's native POL balance on Polygon. */
export async function fetchPolBalance(
  rpcUrl: string,
  privateKey: string
): Promise<PolBalance> {
  const formattedKey = privateKey.startsWith('0x')
    ? privateKey
    : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey as Hex);
  const client: PublicClient = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  });
  const wei = await client.getBalance({ address: account.address });
  return { address: account.address, pol: Number(formatEther(wei)) };
}

/** Pure threshold check: which tracked balances are below their minimum. */
export function classifyBalances(
  report: BalanceReport,
  thresholds: BalanceThresholds
): BalanceClassification {
  const openrouterLow = report.openrouter
    ? report.openrouter.remaining < thresholds.openrouterMinCredits
    : false;
  const polLow = report.pol ? report.pol.pol < thresholds.adminMinPol : false;
  return { openrouterLow, polLow, anyLow: openrouterLow || polLow };
}
