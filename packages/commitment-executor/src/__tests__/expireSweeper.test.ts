import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { CommitmentState } from '../state';
import { ExpireSweeper } from '../expireSweeper';
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

function seed(
  state: CommitmentState,
  hashByte: string,
  deadline: bigint
): void {
  state.onCommitmentCreated({
    commitmentHash: ('0x' + hashByte.repeat(32)) as Hex,
    commitment: {
      predictor: '0x0000000000000000000000000000000000000001',
      predictorWindowEnd: '0',
      deadline: deadline.toString(),
      pickConfigId: ('0x' + '22'.repeat(32)) as Hex,
      amountIn: '100',
      minFillIn: '60',
      minAmountOut: '150',
      executorTip: '0',
      nonce: '0',
    },
    signature: '0xsig',
    chainId: 8453,
    executorContract: '0x00000000000000000000000000000000000000C1',
    createdAt: new Date(0).toISOString(),
  });
}

describe('ExpireSweeper', () => {
  let state: CommitmentState;
  let send: ReturnType<typeof vi.fn>;
  let waitFor: ReturnType<typeof vi.fn>;
  let walletClient: WalletClient;
  let publicClient: PublicClient;
  let nowMs: number;

  beforeEach(() => {
    nowMs = 1_000_000_000; // unix ms; /1000 = 1_000_000s
    state = new CommitmentState({ logger, evictGraceMs: 0, now: () => nowMs });
    send = vi.fn().mockResolvedValue('0xtx');
    waitFor = vi.fn().mockResolvedValue({
      status: 'success',
      gasUsed: 100_000n,
      effectiveGasPrice: 1_000_000_000n,
    });
    walletClient = { sendTransaction: send } as unknown as WalletClient;
    publicClient = {
      waitForTransactionReceipt: waitFor,
    } as unknown as PublicClient;
  });

  function makeSweeper(cfg: Partial<KeeperConfig> = {}) {
    return new ExpireSweeper({
      config: makeConfig(cfg),
      logger,
      state,
      walletClient,
      publicClient,
      now: () => nowMs,
    });
  }

  it('fires expire() only for commitments past deadline AND not settled', async () => {
    seed(state, 'aa', 999_000n); // past deadline (now = 1_000_000s)
    seed(state, 'bb', 2_000_000n); // future deadline
    const sweeper = makeSweeper();
    const report = await sweeper.tick();
    expect(report.attempted).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice on the same commitment in the same tick', async () => {
    seed(state, 'aa', 999_000n);
    const sweeper = makeSweeper();
    const r1 = await sweeper.tick();
    expect(r1.succeeded).toBe(1);
    // Entry is now marked settled by the sweeper, so next tick skips it.
    const r2 = await sweeper.tick();
    expect(r2.attempted).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not fire if an expire tx is already in flight', async () => {
    seed(state, 'aa', 999_000n);
    const sweeper = makeSweeper();
    const first = sweeper.tick();
    // While first is in-flight, run a second; the in-flight flag should
    // keep it to a single attempt.
    const second = sweeper.tick();
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.attempted + r2.attempted).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
