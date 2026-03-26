/**
 * Shared types for condition settlement handlers.
 */

import type { Address } from 'viem';

export interface SapienceCondition {
  id: string;
  resolver: string | null;
}

export type ResolverType = 'ct' | 'pyth' | 'unknown';

export interface SettlementResult {
  conditionId: string;
  resolverType: ResolverType;
  alreadyResolved: boolean;
  canResolve: boolean;
  settled: boolean;
  txHash?: string;
  error?: string;
}

export interface CLIOptions {
  dryRun: boolean;
  execute: boolean;
  wait: boolean;
  help: boolean;
}

export interface SettlementHandler {
  readonly name: string;
  /**
   * Returns true if this handler's required env vars / config are present.
   * If false, conditions for this handler will be skipped with a warning.
   */
  isConfigured(): boolean;
  /**
   * One-time setup (create clients, read on-chain config, etc.).
   * Called once before any conditions are processed.
   */
  init(options: CLIOptions): Promise<void>;
  /**
   * Attempt to settle a single condition.
   */
  settle(
    condition: SapienceCondition,
    options: CLIOptions
  ): Promise<SettlementResult>;
}
