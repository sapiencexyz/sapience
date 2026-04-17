/**
 * Runtime configuration for the commitment-executor keeper.
 *
 * Loaded once at startup. Failing fast on missing required env is
 * preferred over silent defaults for anything that affects on-chain
 * behavior (private key, chain id, executor address).
 */

import { config as dotEnvConfig } from 'dotenv';
import { cleanEnv, str, num } from 'envalid';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

dotEnvConfig();

const env = cleanEnv(process.env, {
  EXECUTOR_PRIVATE_KEY: str({
    desc: 'Hot key used to sign execute()/expire() transactions.',
  }),
  CHAIN_ID: num({
    desc: 'Chain the CommittedIntentExecutor contract is deployed on.',
  }),
  RPC_URL: str({ desc: 'JSON-RPC endpoint URL.' }),
  RELAYER_WS_URL: str({
    desc: 'WebSocket URL of the relayer committed-intent mirror feed.',
  }),
  COMMITTED_INTENT_EXECUTOR_ADDRESS: str({
    desc: 'Deployed CommittedIntentExecutor address.',
  }),

  TIP_RECIPIENT: str({ default: '' }),
  MIN_PROFITABLE_TIP: str({ default: '0' }),

  EXPIRE_SWEEP_INTERVAL_MS: num({ default: 15_000 }),
  RANK_DEBOUNCE_MS: num({ default: 500 }),
  MAX_ATTEMPTS_PER_COMMITMENT: num({ default: 3 }),

  LOG_LEVEL: str({
    choices: ['debug', 'info', 'warn', 'error'],
    default: 'info',
  }),
  METRICS_PORT: num({ default: 9464 }),
  HEALTH_PORT: num({ default: 8080 }),
});

function normalizePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error(
      'EXECUTOR_PRIVATE_KEY must be a 32-byte hex string (optionally 0x-prefixed).'
    );
  }
  return withPrefix as Hex;
}

function normalizeAddress(raw: string, name: string): Address {
  const trimmed = raw.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`${name} must be a 20-byte hex address.`);
  }
  return trimmed as Address;
}

export interface KeeperConfig {
  executorPrivateKey: Hex;
  executorAccountAddress: Address;
  chainId: number;
  rpcUrl: string;
  relayerWsUrl: string;
  committedIntentExecutorAddress: Address;
  tipRecipient: Address;
  minProfitableTip: bigint;
  expireSweepIntervalMs: number;
  rankDebounceMs: number;
  maxAttemptsPerCommitment: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsPort: number;
  healthPort: number;
}

export function loadConfig(): KeeperConfig {
  const executorPrivateKey = normalizePrivateKey(env.EXECUTOR_PRIVATE_KEY);
  const executorAccountAddress = privateKeyToAccount(executorPrivateKey).address;
  const tipRecipient = env.TIP_RECIPIENT
    ? normalizeAddress(env.TIP_RECIPIENT, 'TIP_RECIPIENT')
    : executorAccountAddress;

  let minProfitableTip: bigint;
  try {
    minProfitableTip = BigInt(env.MIN_PROFITABLE_TIP);
  } catch {
    throw new Error(
      `MIN_PROFITABLE_TIP must be a decimal integer (got "${env.MIN_PROFITABLE_TIP}").`
    );
  }

  return {
    executorPrivateKey,
    executorAccountAddress,
    chainId: env.CHAIN_ID,
    rpcUrl: env.RPC_URL,
    relayerWsUrl: env.RELAYER_WS_URL,
    committedIntentExecutorAddress: normalizeAddress(
      env.COMMITTED_INTENT_EXECUTOR_ADDRESS,
      'COMMITTED_INTENT_EXECUTOR_ADDRESS'
    ),
    tipRecipient,
    minProfitableTip,
    expireSweepIntervalMs: env.EXPIRE_SWEEP_INTERVAL_MS,
    rankDebounceMs: env.RANK_DEBOUNCE_MS,
    maxAttemptsPerCommitment: env.MAX_ATTEMPTS_PER_COMMITMENT,
    logLevel: env.LOG_LEVEL,
    metricsPort: env.METRICS_PORT,
    healthPort: env.HEALTH_PORT,
  };
}
