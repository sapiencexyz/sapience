import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encodeAbiParameters, keccak256, toHex, type Block } from 'viem';

// --- Mocks ---

const mockSettleCondition = vi.hoisted(() => vi.fn());
const mockSentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock('../settleCondition', () => ({ settleCondition: mockSettleCondition }));
vi.mock('../../../../instrument', () => ({ default: mockSentry }));

import { processConditionResolved } from '../processConditionResolved';
import type { HandlerContext } from '../handlerContext';

// --- Constants ---

// A bytes32 conditionId ABI-encoded as bytes
const RAW_CONDITION_ID =
  '0xaabbccdd00000000000000000000000000000000000000000000000000000001' as `0x${string}`;
const CONDITION_ID_BYTES = encodeAbiParameters(
  [{ type: 'bytes32' }],
  [RAW_CONDITION_ID]
);

const RESOLVER =
  '0xa5ec46b834ac33ec68e30e7ddeedbbbD4f461784' as `0x${string}`;
const TX_HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const BLOCK_HASH = ('0x' + '00'.repeat(32)) as `0x${string}`;

const CONDITION_RESOLVED_TOPIC = keccak256(
  toHex('ConditionResolved(bytes,bool,bool)')
);

const CTX: HandlerContext = {
  chainId: 13374202,
  contractAddress: RESOLVER,
};

const MOCK_BLOCK = {
  number: 500n,
  timestamp: 1710428500n,
} as unknown as Block;

// --- Helpers ---

function makeLog(opts: {
  isIndecisive?: boolean;
  resolvedToYes?: boolean;
  conditionId?: `0x${string}`;
} = {}) {
  const {
    isIndecisive = false,
    resolvedToYes = true,
    conditionId = CONDITION_ID_BYTES,
  } = opts;

  // All params are non-indexed → everything in data
  const data = encodeAbiParameters(
    [
      { type: 'bytes' },
      { type: 'bool' },
      { type: 'bool' },
    ],
    [conditionId, isIndecisive, resolvedToYes]
  );

  return {
    address: RESOLVER,
    blockHash: BLOCK_HASH,
    blockNumber: 500n,
    data,
    logIndex: 0,
    removed: false,
    topics: [CONDITION_RESOLVED_TOPIC] as [`0x${string}`],
    transactionHash: TX_HASH,
    transactionIndex: 0,
  };
}

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
  mockSettleCondition.mockResolvedValue(undefined);
});

describe('processConditionResolved', () => {
  it('calls settleCondition with resolvedToYes=true for YES outcome', async () => {
    const log = makeLog({ isIndecisive: false, resolvedToYes: true });
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    expect(mockSettleCondition).toHaveBeenCalledOnce();
    const [tag, _log, _block, input] = mockSettleCondition.mock.calls[0];
    expect(tag).toContain('ConditionSettledIndexer');
    expect(input.resolvedToYes).toBe(true);
    expect(input.nonDecisive).toBe(false);
    expect(input.eventData.eventType).toBe('ConditionResolved');
    expect(input.eventData.isIndecisive).toBe(false);
    expect(input.eventData.resolvedToYes).toBe(true);
  });

  it('calls settleCondition with resolvedToYes=false for NO outcome', async () => {
    const log = makeLog({ isIndecisive: false, resolvedToYes: false });
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.resolvedToYes).toBe(false);
    expect(input.nonDecisive).toBe(false);
  });

  it('sets nonDecisive=true for indecisive (tie) outcome', async () => {
    const log = makeLog({ isIndecisive: true, resolvedToYes: false });
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.resolvedToYes).toBe(false);
    expect(input.nonDecisive).toBe(true);
    expect(input.eventData.isIndecisive).toBe(true);
  });

  it('lowercases the conditionId for DB storage', async () => {
    const log = makeLog();
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.conditionId).toBe(input.conditionId.toLowerCase());
  });

  it('passes correct block metadata in eventData', async () => {
    const log = makeLog();
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.eventData.blockNumber).toBe(500);
    expect(input.eventData.transactionHash).toBe(TX_HASH);
    expect(input.eventData.logIndex).toBe(0);
    expect(input.eventData.blockTimestamp).toBe(1710428500);
  });

  it('catches errors and reports to Sentry', async () => {
    mockSettleCondition.mockRejectedValueOnce(new Error('db failure'));
    const log = makeLog();

    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    expect(mockSentry.captureException).toHaveBeenCalledOnce();
    expect(mockSentry.captureException.mock.calls[0][0].message).toBe(
      'db failure'
    );
  });

  it('handles Pyth-style long conditionId bytes', async () => {
    // Pyth conditionIds are 160 bytes (abi.encode of 5 params)
    const pythConditionId = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'uint64' },
        { type: 'int64' },
        { type: 'int32' },
        { type: 'bool' },
      ],
      [
        '0x0000000000000000000000000000000000000000000000000000000000000002' as `0x${string}`,
        1710428400n,
        250000n,
        -2,
        true,
      ]
    );

    const log = makeLog({
      conditionId: pythConditionId,
      isIndecisive: false,
      resolvedToYes: true,
    });
    await processConditionResolved(CTX, log as never, MOCK_BLOCK);

    const input = mockSettleCondition.mock.calls[0][3];
    expect(input.conditionId).toBe(pythConditionId.toLowerCase());
    expect(input.resolvedToYes).toBe(true);
  });
});
