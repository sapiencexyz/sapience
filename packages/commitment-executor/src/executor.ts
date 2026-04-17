/**
 * Decision engine: watches `CommitmentState`, re-ranks quotes when new
 * ones arrive, and submits on-chain `execute()` when the simulated walk
 * clears the predictor's `minFillIn`/`minAmountOut` floors AND the
 * executor tip covers the keeper's gas plus the configured profitability
 * margin.
 *
 * Deliberately minimal: there is no priority queue, no lookahead — just
 * a per-commitment state machine with a debounced re-rank. For v1 this
 * is plenty; production throughput will be low and the marginal
 * improvements from smarter scheduling are not worth the complexity yet.
 */

import type { Pick } from '@sapience/sdk/types/escrow';
import { encodeExecuteCalldata } from '@sapience/sdk/auction/committedIntentSigning';
import { committedIntentExecutorAbi } from '@sapience/sdk/abis';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { KeeperConfig } from './config';
import type { Logger } from './logger';
import { executionsAttempted, gasPaid, tipEarned } from './metrics';
import { rankQuotes, simulateWalk } from './ranker';
import type { CommitmentEntry, CommitmentState } from './state';

export interface ExecutorServiceOptions {
  config: KeeperConfig;
  logger: Logger;
  state: CommitmentState;
  walletClient: WalletClient;
  publicClient: PublicClient;
  /**
   * Picks resolver — the mirror feed does NOT currently carry the full
   * `Pick[]` (only `pickConfigId`). Callers inject a lookup here.
   * Returning `null` means the keeper refuses to execute (no data).
   */
  picksFor: (entry: CommitmentEntry) => Pick[] | null;
  now?: () => number;
}

export class ExecutorService {
  private readonly cfg: KeeperConfig;
  private readonly logger: Logger;
  private readonly state: CommitmentState;
  private readonly walletClient: WalletClient;
  private readonly publicClient: PublicClient;
  private readonly picksFor: (entry: CommitmentEntry) => Pick[] | null;
  private readonly nowFn: () => number;
  private readonly pendingRank = new Map<Hex, NodeJS.Timeout>();
  private readonly inflight = new Set<Hex>();
  private stopped = false;

  constructor(opts: ExecutorServiceOptions) {
    this.cfg = opts.config;
    this.logger = opts.logger.child({ svc: 'executor' });
    this.state = opts.state;
    this.walletClient = opts.walletClient;
    this.publicClient = opts.publicClient;
    this.picksFor = opts.picksFor;
    this.nowFn = opts.now ?? (() => Date.now());
  }

  start(): void {
    this.state.on('commitment:new', (entry) => this.scheduleRank(entry));
    this.state.on('quote:new', (entry) => this.scheduleRank(entry));
    this.state.on('commitment:evicted', (hash) => {
      const timer = this.pendingRank.get(hash);
      if (timer) {
        clearTimeout(timer);
        this.pendingRank.delete(hash);
      }
      this.inflight.delete(hash);
    });
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.pendingRank.values()) clearTimeout(t);
    this.pendingRank.clear();
  }

  /**
   * Visible for tests — force a synchronous decision pass on one
   * commitment. Bypasses the debounce.
   */
  async tryExecute(entry: CommitmentEntry): Promise<ExecuteOutcome> {
    return this.decide(entry);
  }

  private scheduleRank(entry: CommitmentEntry): void {
    if (this.stopped) return;
    const existing = this.pendingRank.get(entry.commitmentHash);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pendingRank.delete(entry.commitmentHash);
      void this.decide(entry).catch((err) =>
        this.logger.error('decision crashed', {
          hash: entry.commitmentHash,
          err: (err as Error).message,
        })
      );
    }, this.cfg.rankDebounceMs);
    this.pendingRank.set(entry.commitmentHash, timer);
  }

  private async decide(entry: CommitmentEntry): Promise<ExecuteOutcome> {
    const hash = entry.commitmentHash;
    if (entry.settled) return { skipped: 'settled' };
    if (this.inflight.has(hash)) return { skipped: 'in_flight' };
    if (entry.attempts >= this.cfg.maxAttemptsPerCommitment) {
      return { skipped: 'max_attempts' };
    }

    const nowSec = BigInt(Math.floor(this.nowFn() / 1000));
    if (nowSec < entry.commitment.predictorWindowEnd) {
      this.logger.debug('skip: still in T1 window', { hash });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'T1_window' };
    }
    if (nowSec > entry.commitment.deadline) {
      this.logger.debug('skip: past deadline — expire sweeper will handle', {
        hash,
      });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'past_deadline' };
    }

    const ranked = rankQuotes(
      Array.from(entry.quotes.values()),
      nowSec
    );
    if (ranked.length === 0) return { skipped: 'no_quotes' };

    const walk = simulateWalk(entry.commitment, ranked);
    if (!walk.monotonicityOk) {
      this.logger.warn('skip: quote set not monotonic', { hash });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'non_monotonic' };
    }
    if (walk.filledIn < entry.commitment.minFillIn) {
      this.logger.debug('skip: simulated filledIn < minFillIn', {
        hash,
        filledIn: walk.filledIn,
        minFillIn: entry.commitment.minFillIn,
      });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'below_minFillIn' };
    }
    if (walk.aggregateOut < entry.commitment.minAmountOut) {
      this.logger.debug('skip: simulated aggregateOut < minAmountOut', {
        hash,
        aggregateOut: walk.aggregateOut,
        minAmountOut: entry.commitment.minAmountOut,
      });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'below_minAmountOut' };
    }

    const picks = this.picksFor(entry);
    if (!picks) {
      this.logger.warn('skip: cannot resolve picks[] for commitment', { hash });
      executionsAttempted.inc({ status: 'skipped' });
      return { skipped: 'picks_unavailable' };
    }

    // Profitability gate — only enforced when tip > 0. If the predictor
    // signed executorTip = 0 then this is an altruistic execution (the
    // predictor is effectively asking anyone to run it for free); the
    // keeper still runs since that's the documented semantics.
    if (entry.commitment.executorTip > 0n) {
      const gasEstimate = await this.estimateGas(entry, picks, walk.usedQuotes);
      if (gasEstimate !== null) {
        const net = entry.commitment.executorTip - gasEstimate;
        if (net < this.cfg.minProfitableTip) {
          this.logger.info('skip: tip does not cover gas + margin', {
            hash,
            tip: entry.commitment.executorTip,
            gasEstimate,
            net,
            margin: this.cfg.minProfitableTip,
          });
          executionsAttempted.inc({ status: 'skipped' });
          return { skipped: 'unprofitable' };
        }
      }
    }

    this.inflight.add(hash);
    entry.attempts += 1;
    try {
      const outcome = await this.submit(entry, picks, walk.usedQuotes);
      return outcome;
    } finally {
      this.inflight.delete(hash);
    }
  }

  private async estimateGas(
    entry: CommitmentEntry,
    picks: Pick[],
    usedQuotes: Array<{ quote: CommitmentEntry['quotes'] extends Map<Hex, infer V> ? V extends { quote: infer Q } ? Q : never : never; signature: Hex }>
  ): Promise<bigint | null> {
    try {
      const quotes = usedQuotes.map((u) => u.quote);
      const sigs = usedQuotes.map((u) => u.signature);
      const gas = await this.publicClient.estimateContractGas({
        abi: committedIntentExecutorAbi,
        address: this.cfg.committedIntentExecutorAddress,
        functionName: 'execute',
        args: [
          commitmentToAbiTuple(entry.commitment),
          entry.predictorSig,
          picks.map(pickToAbiTuple),
          quotes.map(quoteToAbiTuple),
          sigs,
          this.cfg.tipRecipient,
        ],
        account: this.cfg.executorAccountAddress,
      });
      const gasPrice = await this.publicClient
        .getGasPrice()
        .catch(() => 1_000_000_000n);
      return gas * gasPrice;
    } catch (err) {
      this.logger.debug('gas estimation failed (proceeding without gate)', {
        hash: entry.commitmentHash,
        err: (err as Error).message,
      });
      return null;
    }
  }

  private async submit(
    entry: CommitmentEntry,
    picks: Pick[],
    usedQuotes: ReturnType<typeof rankQuotes>
  ): Promise<ExecuteOutcome> {
    const hash = entry.commitmentHash;
    const quotes = usedQuotes.map((u) => u.quote);
    const sigs = usedQuotes.map((u) => u.signature);
    const calldata = encodeExecuteCalldata({
      c: entry.commitment,
      predictorSig: entry.predictorSig,
      picks,
      quotes,
      counterpartySigs: sigs,
      tipRecipient: this.cfg.tipRecipient,
    });
    this.logger.info('submitting execute()', {
      hash,
      slices: usedQuotes.length,
      attempt: entry.attempts,
    });
    try {
      const txHash = await this.walletClient.sendTransaction({
        to: this.cfg.committedIntentExecutorAddress,
        data: calldata,
        account: this.cfg.executorAccountAddress,
        chain: null,
      } as Parameters<WalletClient['sendTransaction']>[0]);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status === 'success') {
        executionsAttempted.inc({ status: 'success' });
        gasPaid.observe(
          { kind: 'execute' },
          Number(receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n))
        );
        tipEarned.observe(Number(entry.commitment.executorTip));
        this.logger.info('execute() success', { hash, txHash });
        return { submitted: true, txHash, status: 'success' };
      }
      executionsAttempted.inc({ status: 'reverted' });
      this.logger.warn('execute() reverted', { hash, txHash });
      return { submitted: true, txHash, status: 'reverted' };
    } catch (err) {
      executionsAttempted.inc({ status: 'rpc_error' });
      this.logger.error('execute() send failed', {
        hash,
        err: (err as Error).message,
      });
      return { submitted: false, status: 'rpc_error' };
    }
  }
}

export type ExecuteOutcome =
  | { submitted: true; txHash: Hex; status: 'success' | 'reverted' }
  | { submitted: false; status: 'rpc_error' }
  | { skipped: SkipReason };

export type SkipReason =
  | 'settled'
  | 'in_flight'
  | 'max_attempts'
  | 'T1_window'
  | 'past_deadline'
  | 'no_quotes'
  | 'non_monotonic'
  | 'below_minFillIn'
  | 'below_minAmountOut'
  | 'picks_unavailable'
  | 'unprofitable';

// ---- Local ABI tuple adapters (match the SDK's internal ones). -------------

function commitmentToAbiTuple(c: CommitmentEntry['commitment']) {
  return {
    predictor: c.predictor,
    predictorWindowEnd: c.predictorWindowEnd,
    deadline: c.deadline,
    pickConfigId: c.pickConfigId,
    amountIn: c.amountIn,
    minFillIn: c.minFillIn,
    minAmountOut: c.minAmountOut,
    executorTip: c.executorTip,
    nonce: c.nonce,
  };
}

function quoteToAbiTuple(q: ReturnType<typeof rankQuotes>[number]['quote']) {
  return {
    counterparty: q.counterparty,
    deadline: q.deadline,
    commitmentHash: q.commitmentHash,
    maxIn: q.maxIn,
    amountOut: q.amountOut,
    nonce: q.nonce,
  };
}

function pickToAbiTuple(p: Pick) {
  return {
    conditionResolver: p.conditionResolver,
    conditionId: p.conditionId,
    predictedOutcome: p.predictedOutcome,
  };
}

// Force `Address` import to be used so tsc doesn't complain when picks
// has no references in this file body.
type _KeepAddress = Address;
