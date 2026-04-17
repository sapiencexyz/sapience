import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { Pick } from '@sapience/sdk/types/escrow';
import { OutcomeSide } from '@sapience/sdk/types/escrow';
import { CommitmentState, type CommitmentEntry } from '../state';
import { ExecutorService } from '../executor';
import { createLogger } from '../logger';
import type { KeeperConfig } from '../config';

const logger = createLogger('error');

function makeConfig(over: Partial<KeeperConfig> = {}): KeeperConfig {
  return {
    executorPrivateKey: ('0x' + '01'.repeat(32)) as Hex,
    executorAccountAddress: '0x0000000000000000000000000000000000000099' as Address,
    chainId: 8453,
    rpcUrl: 'http://localhost:8545',
    relayerWsUrl: 'ws://localhost:3002',
    committedIntentExecutorAddress: '0x00000000000000000000000000000000000000C1' as Address,
    tipRecipient: '0x0000000000000000000000000000000000000099' as Address,
    minProfitableTip: 0n,
    expireSweepIntervalMs: 15000,
    rankDebounceMs: 1,
    maxAttemptsPerCommitment: 3,
    logLevel: 'error',
    metricsPort: 0,
    healthPort: 0,
    ...over,
  };
}

function seedEntry(
  state: CommitmentState,
  partial: {
    predictorWindowEnd?: bigint;
    deadline?: bigint;
    amountIn?: bigint;
    minFillIn?: bigint;
    minAmountOut?: bigint;
    executorTip?: bigint;
  } = {}
): CommitmentEntry {
  state.onCommitmentCreated({
    commitmentHash: ('0x' + 'aa'.repeat(32)) as Hex,
    commitment: {
      predictor: '0x0000000000000000000000000000000000000001' as Address,
      predictorWindowEnd: (partial.predictorWindowEnd ?? 0n).toString(),
      deadline: (partial.deadline ?? 9_999_999_999n).toString(),
      pickConfigId: ('0x' + '22'.repeat(32)) as Hex,
      amountIn: (partial.amountIn ?? 100n).toString(),
      minFillIn: (partial.minFillIn ?? 60n).toString(),
      minAmountOut: (partial.minAmountOut ?? 150n).toString(),
      executorTip: (partial.executorTip ?? 0n).toString(),
      nonce: '0',
    },
    signature: '0xsig',
    chainId: 8453,
    executorContract: '0x00000000000000000000000000000000000000C1',
    createdAt: new Date(0).toISOString(),
  });
  return state.get(('0x' + 'aa'.repeat(32)) as Hex)!;
}

function addQuote(state: CommitmentState, commitHash: string, maxIn: bigint, amountOut: bigint, idx = 0): void {
  state.onQuote({
    quote: {
      counterparty: ('0x' + idx.toString(16).padStart(40, '0')) as Address,
      deadline: '9999999999',
      commitmentHash: commitHash,
      maxIn: maxIn.toString(),
      amountOut: amountOut.toString(),
      nonce: '0',
    },
    signature: '0xcp',
    receivedAt: new Date(0).toISOString(),
    quoteHash: ('0x' + idx.toString(16).padStart(64, '0')) as Hex,
  });
}

const PICK: Pick = {
  conditionResolver: '0x0000000000000000000000000000000000000003' as Address,
  conditionId: '0x00' as Hex,
  predictedOutcome: OutcomeSide.YES,
};

describe('ExecutorService.decide', () => {
  let state: CommitmentState;
  let sendTransaction: ReturnType<typeof vi.fn>;
  let waitForReceipt: ReturnType<typeof vi.fn>;
  let walletClient: WalletClient;
  let publicClient: PublicClient;
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1000 * 1000;
    state = new CommitmentState({ logger, now: () => nowMs });
    sendTransaction = vi.fn().mockResolvedValue('0xtx');
    waitForReceipt = vi.fn().mockResolvedValue({
      status: 'success',
      gasUsed: 100_000n,
      effectiveGasPrice: 1_000_000_000n,
    });
    walletClient = { sendTransaction } as unknown as WalletClient;
    publicClient = {
      estimateContractGas: vi.fn().mockResolvedValue(200_000n),
      getGasPrice: vi.fn().mockResolvedValue(1_000_000_000n),
      waitForTransactionReceipt: waitForReceipt,
    } as unknown as PublicClient;
  });

  function makeExec(cfgOver: Partial<KeeperConfig> = {}, pickResolver = () => [PICK]) {
    return new ExecutorService({
      config: makeConfig(cfgOver),
      logger,
      state,
      walletClient,
      publicClient,
      picksFor: pickResolver,
      now: () => nowMs,
    });
  }

  it('skips when current time is still in T1 window', async () => {
    const entry = seedEntry(state, {
      predictorWindowEnd: 2000n, // future (nowMs/1000 = 1000)
    });
    addQuote(state, entry.commitmentHash, 100n, 200n);
    const exec = makeExec();
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('T1_window');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('skips when walk filledIn < minFillIn', async () => {
    const entry = seedEntry(state, { minFillIn: 80n });
    addQuote(state, entry.commitmentHash, 50n, 120n);
    const exec = makeExec();
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('below_minFillIn');
  });

  it('skips when walk aggregateOut < minAmountOut', async () => {
    const entry = seedEntry(state, { minAmountOut: 500n });
    addQuote(state, entry.commitmentHash, 100n, 200n);
    const exec = makeExec();
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('below_minAmountOut');
  });

  it('skips when executorTip < gas + minProfitableTip', async () => {
    const entry = seedEntry(state, {
      executorTip: 1n, // tiny tip
    });
    addQuote(state, entry.commitmentHash, 100n, 200n);
    // gas = 200_000 * 1_000_000_000 = 2e14 wei, much greater than tip=1
    const exec = makeExec({ minProfitableTip: 0n });
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('unprofitable');
  });

  it('submits execute() when all checks pass', async () => {
    const entry = seedEntry(state, { executorTip: 0n });
    addQuote(state, entry.commitmentHash, 100n, 200n);
    const exec = makeExec();
    const outcome = await exec.tryExecute(entry);
    expect('submitted' in outcome && outcome.submitted).toBe(true);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('respects max-attempts cap', async () => {
    const entry = seedEntry(state);
    addQuote(state, entry.commitmentHash, 100n, 200n);
    // Simulate prior failed attempts.
    entry.attempts = 3;
    const exec = makeExec({ maxAttemptsPerCommitment: 3 });
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('max_attempts');
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('skips when picks[] cannot be resolved', async () => {
    const entry = seedEntry(state);
    addQuote(state, entry.commitmentHash, 100n, 200n);
    const exec = makeExec({}, () => null);
    const outcome = await exec.tryExecute(entry);
    expect('skipped' in outcome && outcome.skipped).toBe('picks_unavailable');
  });
});
