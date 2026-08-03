import { vi, type Mock } from 'vitest';
import { waitForCallsStatus } from 'viem/actions';
import {
  pickFinalTransactionHash,
  resolveEoaBatchResult,
} from './transactionExecutor';

vi.mock('viem/actions', () => ({
  waitForCallsStatus: vi.fn(),
}));

// ─── pickFinalTransactionHash ────────────────────────────────────────────────

describe('pickFinalTransactionHash', () => {
  it('picks from receipts array (last non-empty)', () => {
    expect(
      pickFinalTransactionHash({
        receipts: [{ transactionHash: '0xaaa' }, { transactionHash: '0xbbb' }],
      })
    ).toBe('0xbbb');
  });

  it('falls back to transactionHash field', () => {
    expect(pickFinalTransactionHash({ transactionHash: '0xccc' })).toBe(
      '0xccc'
    );
  });

  it('falls back to txHash field', () => {
    expect(pickFinalTransactionHash({ txHash: '0xddd' })).toBe('0xddd');
  });

  it('returns undefined for empty data', () => {
    expect(pickFinalTransactionHash(undefined)).toBeUndefined();
    expect(pickFinalTransactionHash({})).toBeUndefined();
  });
});

// ─── resolveEoaBatchResult ────────────────────────────────────────────────────

describe('resolveEoaBatchResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns hash via pickFinalTransactionHash when no data.id', async () => {
    const data = { receipts: [{ transactionHash: '0xabc' }] };
    const result = await resolveEoaBatchResult(data);
    expect(result).toBe('0xabc');
    expect(waitForCallsStatus).not.toHaveBeenCalled();
  });

  it('returns hash via pickFinalTransactionHash when no client', async () => {
    const data = { id: 'bundle-1', txHash: '0xdef' };
    const result = await resolveEoaBatchResult(data);
    expect(result).toBe('0xdef');
    expect(waitForCallsStatus).not.toHaveBeenCalled();
  });

  it('calls waitForCallsStatus and returns hash when data.id + client present', async () => {
    (waitForCallsStatus as Mock).mockResolvedValue({
      receipts: [{ transactionHash: '0xpolled' }],
    });
    const result = await resolveEoaBatchResult(
      { id: 'bundle-2' },
      { mock: 'client' }
    );
    expect(waitForCallsStatus).toHaveBeenCalledWith(
      { mock: 'client' },
      { id: 'bundle-2' }
    );
    expect(result).toBe('0xpolled');
  });

  it('returns undefined when waitForCallsStatus throws', async () => {
    (waitForCallsStatus as Mock).mockRejectedValue(new Error('network error'));
    const result = await resolveEoaBatchResult(
      { id: 'bundle-3' },
      { mock: 'client' }
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined for undefined/null data', async () => {
    expect(await resolveEoaBatchResult(undefined)).toBeUndefined();
    expect(await resolveEoaBatchResult(null)).toBeUndefined();
  });
});
