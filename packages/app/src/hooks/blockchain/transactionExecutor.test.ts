import { vi, type Mock } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import { waitForCallsStatus } from 'viem/actions';
import {
  getExecutionPath,
  isEtherealChain,
  prepareCallsWithWrapping,
  encodeWriteContractToCall,
  createWrapTransaction,
  formatSessionError,
  pickFinalTransactionHash,
  resolveEoaBatchResult,
  executeViaSessionKeyDefault,
  executeTransaction,
  WUSDE_DEPOSIT_SELECTOR,
  type TransactionCall,
  type ExecutionDeps,
  type SessionClient,
} from './transactionExecutor';

// Chain ID constants matching @sapience/sdk/constants
const CHAIN_ID_ETHEREAL = 5064014;
const CHAIN_ID_ETHEREAL_TESTNET = 13374202;

vi.mock('viem/actions', () => ({
  waitForCallsStatus: vi.fn(),
}));

// ─── getExecutionPath ────────────────────────────────────────────────────────

describe('getExecutionPath', () => {
  it('returns eoa when not using smart account', () => {
    expect(getExecutionPath(false, false)).toBe('eoa');
    expect(getExecutionPath(false, true)).toBe('eoa');
  });

  it('returns session when smart account + session available', () => {
    expect(getExecutionPath(true, true)).toBe('session');
  });

  it('returns owner when smart account but no session', () => {
    expect(getExecutionPath(true, false)).toBe('owner');
  });
});

// ─── isEtherealChain ─────────────────────────────────────────────────────────

describe('isEtherealChain', () => {
  it('returns true for Ethereal chain ID', () => {
    expect(isEtherealChain(CHAIN_ID_ETHEREAL)).toBe(true);
  });

  it('returns true for Ethereal Testnet chain ID', () => {
    expect(isEtherealChain(CHAIN_ID_ETHEREAL_TESTNET)).toBe(true);
  });

  it('returns false for other chains', () => {
    expect(isEtherealChain(1)).toBe(false);
    expect(isEtherealChain(42161)).toBe(false);
  });
});

// ─── prepareCallsWithWrapping ────────────────────────────────────────────────

describe('prepareCallsWithWrapping', () => {
  const baseCalls: TransactionCall[] = [
    {
      to: '0x1111111111111111111111111111111111111111',
      data: '0xabcd',
      value: 1000n,
    },
  ];

  it('prepends wrap tx on Ethereal when value > 0', () => {
    const result = prepareCallsWithWrapping(baseCalls, CHAIN_ID_ETHEREAL);
    expect(result).toHaveLength(2);
    expect(result[0].to).toBeDefined();
    expect(result[0].value).toBe(1000n);
    expect(result[1].value).toBe(0n);
    expect(result[1].data).toBe('0xabcd');
  });

  it('passes through when value is 0 on Ethereal', () => {
    const zeroCalls: TransactionCall[] = [
      {
        to: '0x1111111111111111111111111111111111111111',
        data: '0xabcd',
        value: 0n,
      },
    ];
    const result = prepareCallsWithWrapping(zeroCalls, CHAIN_ID_ETHEREAL);
    expect(result).toHaveLength(1);
    expect(result).toEqual(zeroCalls);
  });

  it('passes through on non-Ethereal chain', () => {
    const result = prepareCallsWithWrapping(baseCalls, 42161);
    expect(result).toBe(baseCalls);
  });

  it('sums value from multiple calls', () => {
    const multiCalls: TransactionCall[] = [
      {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x01',
        value: 300n,
      },
      {
        to: '0x2222222222222222222222222222222222222222',
        data: '0x02',
        value: 700n,
      },
    ];
    const result = prepareCallsWithWrapping(multiCalls, CHAIN_ID_ETHEREAL);
    expect(result).toHaveLength(3);
    expect(result[0].value).toBe(1000n);
    expect(result[1].value).toBe(0n);
    expect(result[2].value).toBe(0n);
  });
});

// ─── encodeWriteContractToCall ───────────────────────────────────────────────

describe('encodeWriteContractToCall', () => {
  const testAbi = parseAbi(['function transfer(address to, uint256 amount)']);

  it('encodes params into a TransactionCall', () => {
    const result = encodeWriteContractToCall({
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      abi: testAbi,
      functionName: 'transfer',
      args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 100n],
      value: 50n,
    });

    expect(result.to).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.value).toBe(50n);
    expect(result.data).toBe(
      encodeFunctionData({
        abi: testAbi,
        functionName: 'transfer',
        args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 100n],
      })
    );
  });

  it('defaults value to 0n when undefined', () => {
    const result = encodeWriteContractToCall({
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      abi: testAbi,
      functionName: 'transfer',
      args: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 1n],
    });
    expect(result.value).toBe(0n);
  });
});

// ─── formatSessionError ──────────────────────────────────────────────────────

describe('formatSessionError', () => {
  it('returns shortMessage if available', () => {
    const err = Object.assign(new Error('long message'), {
      shortMessage: 'short',
    });
    expect(formatSessionError(err)).toBe('short');
  });

  it('falls back to message', () => {
    expect(formatSessionError(new Error('hello'))).toBe('hello');
  });

  it('stringifies non-errors', () => {
    expect(formatSessionError('boom')).toBe('boom');
  });
});

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

// ─── executeViaSessionKeyDefault ─────────────────────────────────────────────

describe('executeViaSessionKeyDefault', () => {
  const mockEncodeCalls = vi.fn().mockResolvedValue('0xencoded');
  const mockSendUserOperation = vi.fn().mockResolvedValue('0xuserophash');
  const mockClient: SessionClient = {
    account: { encodeCalls: mockEncodeCalls },
    sendUserOperation: mockSendUserOperation,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes calls and sends user operation', async () => {
    const calls: TransactionCall[] = [
      {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x',
        value: 0n,
      },
    ];
    const onTxSending = vi.fn();
    const onTxSent = vi.fn();
    const onReceiptConfirmed = vi.fn();

    const result = await executeViaSessionKeyDefault(
      mockClient,
      calls,
      CHAIN_ID_ETHEREAL,
      {
        onTxSending,
        onTxSent,
        onReceiptConfirmed,
      }
    );

    expect(mockEncodeCalls).toHaveBeenCalledWith(calls);
    expect(onTxSending).toHaveBeenCalled();
    expect(mockSendUserOperation).toHaveBeenCalledWith({
      callData: '0xencoded',
    });
    expect(onTxSent).toHaveBeenCalledWith('0xuserophash');
    expect(onReceiptConfirmed).toHaveBeenCalled();
    expect(result).toBe('0xuserophash');
  });

  it('throws if session expired', async () => {
    await expect(
      executeViaSessionKeyDefault(mockClient, [], CHAIN_ID_ETHEREAL, {
        sessionConfig: { expiresAt: Date.now() - 60_000 },
      })
    ).rejects.toThrow(/Session expired/);
  });

  it('throws if account is missing', async () => {
    const noAccountClient: SessionClient = {
      sendUserOperation: mockSendUserOperation,
    };
    await expect(
      executeViaSessionKeyDefault(noAccountClient, [], CHAIN_ID_ETHEREAL, {})
    ).rejects.toThrow('Session client account not available');
  });
});

// ─── executeTransaction ──────────────────────────────────────────────────────

describe('executeTransaction', () => {
  const dummyCalls: TransactionCall[] = [
    {
      to: '0x1111111111111111111111111111111111111111',
      data: '0xaa',
      value: 0n,
    },
  ];

  describe('session path', () => {
    it('calls executeViaSessionKey with wrapped calls', async () => {
      const executeViaSessionKey = vi.fn().mockResolvedValue('0xophash');
      const result = await executeTransaction(
        dummyCalls,
        CHAIN_ID_ETHEREAL,
        'session',
        {
          sessionClient: {
            account: { encodeCalls: vi.fn() },
            sendUserOperation: vi.fn(),
          },
          executeViaSessionKey,
        }
      );

      expect(executeViaSessionKey).toHaveBeenCalled();
      expect(result.path).toBe('session');
      expect(result.hash).toBeUndefined();
    });

    it('creates Arbitrum session lazily when needed', async () => {
      const newClient: SessionClient = {
        account: { encodeCalls: vi.fn() },
        sendUserOperation: vi.fn(),
      };
      const createArbitrumSessionIfNeeded = vi
        .fn()
        .mockResolvedValue(newClient);
      const executeViaSessionKey = vi.fn().mockResolvedValue('0x');

      await executeTransaction(dummyCalls, 42161, 'session', {
        sessionClient: null,
        needsArbitrumSession: true,
        createArbitrumSessionIfNeeded,
        executeViaSessionKey,
      });

      expect(createArbitrumSessionIfNeeded).toHaveBeenCalled();
      expect(executeViaSessionKey).toHaveBeenCalledWith(
        newClient,
        expect.any(Array),
        42161
      );
    });

    it('falls through to owner when sessionClient is null', async () => {
      const executeViaOwnerSigning = vi.fn().mockResolvedValue('0xownerhash');

      const result = await executeTransaction(
        dummyCalls,
        CHAIN_ID_ETHEREAL,
        'session',
        {
          sessionClient: null,
          executeViaOwnerSigning,
        }
      );

      expect(result.path).toBe('owner');
      expect(result.hash).toBe('0xownerhash');
    });
  });

  describe('owner path', () => {
    it('calls executeViaOwnerSigning', async () => {
      const executeViaOwnerSigning = vi.fn().mockResolvedValue('0xownertx');

      const result = await executeTransaction(
        dummyCalls,
        CHAIN_ID_ETHEREAL,
        'owner',
        {
          executeViaOwnerSigning,
        }
      );

      expect(executeViaOwnerSigning).toHaveBeenCalled();
      expect(result.hash).toBe('0xownertx');
      expect(result.path).toBe('owner');
    });

    it('wraps calls on Ethereal with value', async () => {
      const callsWithValue: TransactionCall[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0xaa',
          value: 500n,
        },
      ];
      const executeViaOwnerSigning = vi.fn().mockResolvedValue('0x');

      await executeTransaction(callsWithValue, CHAIN_ID_ETHEREAL, 'owner', {
        executeViaOwnerSigning,
      });

      const receivedCalls = executeViaOwnerSigning.mock.calls[0][0];
      expect(receivedCalls).toHaveLength(2);
      expect(receivedCalls[0].to).toBeDefined();
      expect(receivedCalls[1].value).toBe(0n);
    });
  });

  describe('eoa path', () => {
    it('uses writeContractAsync for single call in writeContract mode', async () => {
      const writeContractAsync = vi.fn().mockResolvedValue('0xeoahash');
      const originalArgs = {
        chainId: 42161,
        address: '0x',
        abi: [],
        functionName: 'foo',
      };

      const result = await executeTransaction(
        dummyCalls,
        42161,
        'eoa',
        {
          writeContractAsync,
        },
        'writeContract',
        originalArgs
      );

      expect(writeContractAsync).toHaveBeenCalledWith(originalArgs);
      expect(result.hash).toBe('0xeoahash');
      expect(result.path).toBe('eoa');
    });

    it('uses sendCallsAsync for batch sendCalls mode', async () => {
      const sendCallsAsync = vi.fn().mockResolvedValue({ txHash: '0xbatch' });
      const originalArgs = { chainId: 42161, calls: dummyCalls };

      const result = await executeTransaction(
        dummyCalls,
        42161,
        'eoa',
        {
          sendCallsAsync,
        },
        'sendCalls',
        originalArgs
      );

      expect(sendCallsAsync).toHaveBeenCalled();
      expect(result.data).toEqual({ txHash: '0xbatch' });
      expect(result.path).toBe('eoa');
    });

    it('uses sendCalls for Ethereal writeContract with value (wrapping)', async () => {
      const callsWithValue: TransactionCall[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0xaa',
          value: 100n,
        },
      ];
      const sendCallsAsync = vi.fn().mockResolvedValue({
        receipts: [{ transactionHash: '0xwrapped' }],
      });

      const result = await executeTransaction(
        callsWithValue,
        CHAIN_ID_ETHEREAL,
        'eoa',
        { sendCallsAsync, writeContractAsync: vi.fn() },
        'writeContract'
      );

      expect(sendCallsAsync).toHaveBeenCalled();
      const sentCalls = sendCallsAsync.mock.calls[0][0].calls;
      expect(sentCalls).toHaveLength(2);
      expect(result.hash).toBe('0xwrapped');
    });
  });
});
