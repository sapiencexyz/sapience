import { describe, it, expect, vi } from 'vitest';
import type { Block, PublicClient } from 'viem';
import { resolveBlocksForTimestamps } from './utils';

// ─── Synthetic chain helpers ────────────────────────────────────────────────

/**
 * Build a mock PublicClient that serves blocks from a deterministic
 * block-number → timestamp function. Tracks call count + max concurrency.
 */
function makeMockClient(
  tsForBlock: (blockNumber: bigint) => bigint,
  latestBlockNumber: bigint
) {
  let active = 0;
  let maxConcurrent = 0;
  let calls = 0;

  const getBlock = vi.fn(
    async ({ blockNumber }: { blockNumber?: bigint }): Promise<Block> => {
      calls++;
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      const bn = blockNumber ?? latestBlockNumber;
      return {
        number: bn,
        timestamp: tsForBlock(bn),
      } as unknown as Block;
    }
  );

  const getBlockNumber = vi.fn(async () => latestBlockNumber);

  return {
    client: { getBlock, getBlockNumber } as unknown as PublicClient,
    stats: {
      getCalls: () => calls,
      getMaxConcurrent: () => maxConcurrent,
      getBlockMock: getBlock,
      getBlockNumberMock: getBlockNumber,
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('resolveBlocksForTimestamps', () => {
  it('resolves blocks for targets on a constant-rate chain', async () => {
    const BLOCK_TIME = 2n;
    const GENESIS = 1_700_000_000n;
    const LATEST = 1_000_000n;

    const { client } = makeMockClient(
      (bn) => GENESIS + bn * BLOCK_TIME,
      LATEST
    );

    // Pick 10 targets spread across the range
    const targets: number[] = [];
    for (let i = 0; i < 10; i++) {
      const bn = BigInt(i) * (LATEST / 10n);
      targets.push(Number(GENESIS + bn * BLOCK_TIME + 1n));
    }

    const blocks = await resolveBlocksForTimestamps(client, targets, {
      concurrency: 5,
    });

    expect(blocks.length).toBe(targets.length);

    // For every returned block, assert block.timestamp >= target AND the
    // previous block (if any) has timestamp < target.
    for (let i = 0; i < targets.length; i++) {
      const block = blocks[i];
      const target = BigInt(targets[i]);
      expect(block.number).not.toBeNull();
      expect(block.timestamp >= target).toBe(true);
      if (block.number! > 0n) {
        const prev = GENESIS + (block.number! - 1n) * BLOCK_TIME;
        expect(prev < target).toBe(true);
      }
    }
  });

  it('bounds per-lookup probe count to ~log2(chunkSize) + 1', async () => {
    const BLOCK_TIME = 2n;
    const GENESIS = 1_700_000_000n;
    const LATEST = 1_000_000n;

    const { client, stats } = makeMockClient(
      (bn) => GENESIS + bn * BLOCK_TIME,
      LATEST
    );

    // 10 targets, chunks = max(6, round(1.44*10)) = 14, chunkSize ≈ 71500, log2 ≈ 17
    const N = 10;
    const targets: number[] = [];
    for (let i = 0; i < N; i++) {
      const bn = BigInt(i) * (LATEST / BigInt(N));
      targets.push(Number(GENESIS + bn * BLOCK_TIME + 1n));
    }

    await resolveBlocksForTimestamps(client, targets, { concurrency: 5 });

    // Expected cost: 2 prologue calls (latestBlockNumber + latestBlock) + K+1
    // skeleton fetches + N × log2(chunkSize) lookup fetches.
    const chunks = Math.max(6, Math.round(1.44 * N)); // 14
    const chunkSize = Number(LATEST) / chunks;
    const maxLookupProbes = Math.ceil(Math.log2(chunkSize)) + 1;
    const expectedMax = 2 + (chunks + 1) + N * maxLookupProbes;

    expect(stats.getCalls()).toBeLessThanOrEqual(expectedMax);
  });

  it('handles variable block rate correctly (within and between chunks)', async () => {
    const GENESIS = 1_700_000_000n;
    const LATEST = 100_000n;

    // Variable-rate function: block time alternates between 1s and 5s.
    const tsForBlock = (bn: bigint): bigint => {
      let ts = GENESIS;
      for (let i = 0n; i < bn; i++) {
        ts += (i / 10000n) % 2n === 0n ? 1n : 5n;
      }
      return ts;
    };

    const { client } = makeMockClient(tsForBlock, LATEST);

    const targets = [
      Number(tsForBlock(5_000n) + 1n),
      Number(tsForBlock(25_000n) + 1n),
      Number(tsForBlock(50_000n) + 1n),
      Number(tsForBlock(75_000n) + 1n),
      Number(tsForBlock(95_000n) + 1n),
    ];

    const blocks = await resolveBlocksForTimestamps(client, targets, {
      concurrency: 5,
    });

    for (let i = 0; i < targets.length; i++) {
      const block = blocks[i];
      const target = BigInt(targets[i]);
      expect(block.number).not.toBeNull();
      expect(block.timestamp >= target).toBe(true);
      if (block.number! > 0n) {
        expect(tsForBlock(block.number! - 1n) < target).toBe(true);
      }
    }
  });

  it('respects the concurrency cap throughout', async () => {
    const BLOCK_TIME = 2n;
    const GENESIS = 1_700_000_000n;
    const LATEST = 500_000n;

    const { client, stats } = makeMockClient(
      (bn) => GENESIS + bn * BLOCK_TIME,
      LATEST
    );

    const N = 20;
    const targets: number[] = [];
    for (let i = 0; i < N; i++) {
      const bn = BigInt(i) * (LATEST / BigInt(N));
      targets.push(Number(GENESIS + bn * BLOCK_TIME + 1n));
    }

    const concurrency = 3;
    await resolveBlocksForTimestamps(client, targets, { concurrency });

    expect(stats.getMaxConcurrent()).toBeLessThanOrEqual(concurrency);
  });

  it('returns an empty array for empty input without making RPC calls', async () => {
    const { client, stats } = makeMockClient(
      (bn) => 1_700_000_000n + bn * 2n,
      1_000_000n
    );

    const result = await resolveBlocksForTimestamps(client, [], {
      concurrency: 5,
    });

    expect(result).toEqual([]);
    expect(stats.getCalls()).toBe(0);
  });
});
