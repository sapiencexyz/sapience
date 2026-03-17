import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type Block } from 'viem';

// --- Mocks ---

const mockSettleCondition = vi.hoisted(() => vi.fn());
const mockSentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('../settleCondition', () => ({ settleCondition: mockSettleCondition }));
vi.mock('../../../../instrument', () => ({ default: mockSentry }));

import { processManualConditionSettled } from '../processManualConditionSettled';
import type { HandlerContext } from '../handlerContext';

// --- Constants ---

const CONDITION_ID =
  '0xaabbccdd00000000000000000000000000000000000000000000000000000001' as `0x${string}`;
const SETTLER =
  '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`;
const RESOLVER =
  '0xa5ec46b834ac33ec68e30e7ddeedbbbD4f461784' as `0x${string}`;
const TX_HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const BLOCK_HASH = ('0x' + '00'.repeat(32)) as `0x${string}`;

const MANUAL_CONDITION_SETTLED_ABI = [
  {
    type: 'event' as const,
    name: 'ConditionSettled' as const,
    inputs: [
      { name: 'conditionId', type: 'bytes32' as const, indexed: true },
      { name: 'yesWeight', type: 'uint256' as const, indexed: false },
      { name: 'noWeight', type: 'uint256' as const, indexed: false },
      { name: 'settler', type: 'address' as const, indexed: true },
    ],
  },
] as const;

const CTX: HandlerContext = {
  chainId: 13374202,
  contractAddress: RESOLVER,
};

const MOCK_BLOCK = {
  number: 500n,
  timestamp: 1710428500n,
} as unknown as Block;

// --- Helpers ---

function makeLog(yesWeight: bigint, noWeight: bigint) {
  const topics = encodeEventTopics({
    abi: MANUAL_CONDITION_SETTLED_ABI,
    eventName: 'ConditionSettled',
    args: { conditionId: CONDITION_ID, settler: SETTLER },
  });

  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [yesWeight, noWeight]
  );

  return {
    address: RESOLVER,
    blockHash: BLOCK_HASH,
    blockNumber: 500n,
    data,
    logIndex: 0,
    removed: false,
    topics,
    transactionHash: TX_HASH,
    transactionIndex: 0,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockSettleCondition.mockResolvedValue(undefined);
});

describe('processManualConditionSettled', () => {
  it('calls settleCondition with resolvedToYes=true when yesWeight>0 and noWeight=0', async () => {
    const log = makeLog(1n, 0n);
    await processManualConditionSettled(CTX, log as never, MOCK_BLOCK);

    expect(mockSettleCondition).toHaveBeenCalledOnce();
    const [tag, _passedLog, _block, input] = mockSettleCondition.mock.calls[0];
    expect(tag).toContain('ConditionSettledIndexer');
    expect(tag).toContain('13374202');
    expect(input.conditionId).toBe(CONDITION_ID.toLowerCase());
    expect(input.resolvedToYes).toBe(true);
    expect(input.nonDecisive).toBe(false);
    expect(input.eventData.eventType).toBe('ConditionSettled');
    expect(input.eventData.yesWeight).toBe('1');
    expect(input.eventData.noWeight).toBe('0');
    expect(input.eventData.settler.toLowerCase()).toBe(
      SETTLER.toLowerCase()
    );
  });

  it('calls settleCondition with resolvedToYes=false when noWeight>0 and yesWeight=0', async () => {
    const log = makeLog(0n, 1n);
    await processManualConditionSettled(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.resolvedToYes).toBe(false);
    expect(input.nonDecisive).toBe(false);
  });

  it('sets nonDecisive=true when both weights are positive', async () => {
    const log = makeLog(1n, 1n);
    await processManualConditionSettled(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.resolvedToYes).toBe(false);
    expect(input.nonDecisive).toBe(true);
  });

  it('passes correct block metadata in eventData', async () => {
    const log = makeLog(1n, 0n);
    await processManualConditionSettled(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.eventData.blockNumber).toBe(500);
    expect(input.eventData.transactionHash).toBe(TX_HASH);
    expect(input.eventData.logIndex).toBe(0);
    expect(input.eventData.blockTimestamp).toBe(1710428500);
  });

  it('catches errors and reports to Sentry', async () => {
    mockSettleCondition.mockRejectedValueOnce(new Error('db failure'));
    const log = makeLog(1n, 0n);

    await processManualConditionSettled(CTX, log as never, MOCK_BLOCK);

    expect(mockSentry.captureException).toHaveBeenCalledOnce();
    expect(mockSentry.captureException.mock.calls[0][0].message).toBe(
      'db failure'
    );
  });
});
