import { describe, it, expect } from 'vitest';
import type { PublicClient } from 'viem';

import { batchCanRequestResolution } from '../polygon/client';

const ID_A = '0x'.padEnd(66, 'a');
const ID_B = '0x'.padEnd(66, 'b');
const ID_C = '0x'.padEnd(66, 'c');

function clientWithResults(
  results: Array<{ status: 'success' | 'failure'; result?: boolean }>
): PublicClient {
  return {
    multicall: async () => results,
  } as unknown as PublicClient;
}

describe('batchCanRequestResolution', () => {
  it('maps successful results to their boolean values', async () => {
    const client = clientWithResults([
      { status: 'success', result: true },
      { status: 'success', result: false },
    ]);

    const out = await batchCanRequestResolution(client, [ID_A, ID_B]);

    expect(out.get(ID_A)).toBe(true);
    expect(out.get(ID_B)).toBe(false);
  });

  it('treats an individual failed call as false when others succeed', async () => {
    const client = clientWithResults([
      { status: 'success', result: true },
      { status: 'failure' },
      { status: 'success', result: true },
    ]);

    const out = await batchCanRequestResolution(client, [ID_A, ID_B, ID_C]);

    expect(out.get(ID_A)).toBe(true);
    expect(out.get(ID_B)).toBe(false);
    expect(out.get(ID_C)).toBe(true);
  });

  it('throws when every call in a batch fails (RPC outage, not per-condition state)', async () => {
    // viem's multicall with allowFailure (the default) surfaces a dead RPC
    // as N per-call failures instead of a rejected promise. Mapping that to
    // canRequestResolution=false made the settle cron silently skip every
    // condition and report zero errors.
    const client = clientWithResults([
      { status: 'failure' },
      { status: 'failure' },
      { status: 'failure' },
    ]);

    await expect(
      batchCanRequestResolution(client, [ID_A, ID_B, ID_C])
    ).rejects.toThrow(/every call/i);
  });
});
