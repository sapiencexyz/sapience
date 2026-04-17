/**
 * Periodic sweep that calls `expire()` on every tracked commitment
 * whose `deadline` has passed and which has not been settled. Per PRD
 * §4.3.1 this is cheap (one SSTORE + transfers) and any third party may
 * submit it — the keeper just happens to be the third party.
 */

import { encodeExpireCalldata } from '@sapience/sdk/auction/committedIntentSigning';
import type { Hex, PublicClient, WalletClient } from 'viem';
import type { KeeperConfig } from './config';
import type { Logger } from './logger';
import { expirationsAttempted, gasPaid } from './metrics';
import type { CommitmentEntry, CommitmentState } from './state';

export interface ExpireSweeperOptions {
  config: KeeperConfig;
  logger: Logger;
  state: CommitmentState;
  walletClient: WalletClient;
  publicClient: PublicClient;
  now?: () => number;
}

export class ExpireSweeper {
  private readonly cfg: KeeperConfig;
  private readonly logger: Logger;
  private readonly state: CommitmentState;
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly nowFn: () => number;
  private timer: NodeJS.Timeout | null = null;

  constructor(opts: ExpireSweeperOptions) {
    this.cfg = opts.config;
    this.logger = opts.logger.child({ svc: 'expire-sweeper' });
    this.state = opts.state;
    this.walletClient = opts.walletClient;
    this.publicClient = opts.publicClient;
    this.nowFn = opts.now ?? (() => Date.now());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.tick().catch((e) => this.logger.error('tick crashed', { err: (e as Error).message })),
      this.cfg.expireSweepIntervalMs
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Visible for tests — one sweep pass over current state. */
  async tick(): Promise<TickReport> {
    const nowSec = BigInt(Math.floor(this.nowFn() / 1000));
    const entries = this.state.entriesArray();
    const report: TickReport = { scanned: entries.length, attempted: 0, succeeded: 0, reverted: 0, rpcErrors: 0 };

    for (const entry of entries) {
      if (entry.settled) continue;
      if (entry.expireTxInFlight) continue;
      if (nowSec <= entry.commitment.deadline) continue;

      entry.expireTxInFlight = true;
      report.attempted += 1;
      try {
        const outcome = await this.submit(entry);
        if (outcome === 'success') report.succeeded += 1;
        else if (outcome === 'reverted') report.reverted += 1;
        else report.rpcErrors += 1;
      } finally {
        entry.expireTxInFlight = false;
      }
    }

    this.state.evictExpired(this.nowFn());
    return report;
  }

  private async submit(entry: CommitmentEntry): Promise<'success' | 'reverted' | 'rpc_error'> {
    const data = encodeExpireCalldata(entry.commitment, entry.predictorSig);
    this.logger.info('submitting expire()', {
      hash: entry.commitmentHash,
    });
    try {
      const txHash: Hex = await this.walletClient.sendTransaction({
        to: this.cfg.committedIntentExecutorAddress,
        data,
        account: this.cfg.executorAccountAddress,
        chain: null,
      } as Parameters<WalletClient['sendTransaction']>[0]);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'success') {
        expirationsAttempted.inc({ status: 'success' });
        gasPaid.observe(
          { kind: 'expire' },
          Number(receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n))
        );
        entry.settled = true;
        this.logger.info('expire() success', {
          hash: entry.commitmentHash,
          txHash,
        });
        return 'success';
      }
      expirationsAttempted.inc({ status: 'reverted' });
      this.logger.warn('expire() reverted', {
        hash: entry.commitmentHash,
        txHash,
      });
      return 'reverted';
    } catch (err) {
      expirationsAttempted.inc({ status: 'rpc_error' });
      this.logger.error('expire() send failed', {
        hash: entry.commitmentHash,
        err: (err as Error).message,
      });
      return 'rpc_error';
    }
  }
}

export interface TickReport {
  scanned: number;
  attempted: number;
  succeeded: number;
  reverted: number;
  rpcErrors: number;
}
