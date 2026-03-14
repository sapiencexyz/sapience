/**
 * Regression tests for verifySessionApproval ownership check (bug 68392).
 *
 * These tests verify that:
 * 1. A valid session approval from the real owner is accepted
 * 2. A spoofed approval (signed by attacker EOA, claiming victim smart account) is rejected
 * 3. Various malformed inputs are handled correctly
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex } from 'viem';

// Mock recoverTypedDataAddress so we can control the "recovered" owner
const mockRecoverTypedDataAddress = vi.fn();
vi.mock('viem', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    recoverTypedDataAddress: (...args: unknown[]) =>
      mockRecoverTypedDataAddress(...args),
  };
});

// Mock computeSmartAccountAddress so we can control the ownership check
const mockComputeSmartAccountAddress = vi.fn();
vi.mock('./smartAccount', () => ({
  computeSmartAccountAddress: (...args: unknown[]) =>
    mockComputeSmartAccountAddress(...args),
}));

import {
  verifySessionApproval,
  parseZeroDevApproval,
  extractSessionKeyFromValidatorData,
  type SessionApprovalPayload,
  type EnableTypedData,
} from './verification';

// --- Test fixtures ---

const OWNER_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const SMART_ACCOUNT_ADDRESS =
  '0xcccccccccccccccccccccccccccccccccccccccc' as Address;
const SESSION_KEY_ADDRESS =
  '0xdddddddddddddddddddddddddddddddddddddddd' as Address;

const CHAIN_ID = 42161; // Arbitrum

// Pre-computed ABI-encoded bytes[] containing one element:
// flag(0x0001) + signerContract(zero address) + sessionKey(SESSION_KEY_ADDRESS)
// Generated via: encodeAbiParameters([{type:'bytes[]'}], [['0x0001' + '00'.repeat(20) + 'dd'.repeat(20)]])
const VALID_VALIDATOR_DATA: Hex =
  '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002a00010000000000000000000000000000000000000000dddddddddddddddddddddddddddddddddddddddd00000000000000000000000000000000000000000000';

// Pre-computed empty bytes[] — encodeAbiParameters([{type:'bytes[]'}], [[]])
const EMPTY_VALIDATOR_DATA: Hex =
  '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000';

function makeTypedData(overrides?: Partial<EnableTypedData>): EnableTypedData {
  return {
    domain: {
      name: 'Kernel',
      version: '0.3.1',
      chainId: CHAIN_ID,
      verifyingContract: SMART_ACCOUNT_ADDRESS,
    },
    types: {
      Enable: [
        { name: 'validationId', type: 'bytes21' },
        { name: 'nonce', type: 'uint32' },
        { name: 'hook', type: 'address' },
        { name: 'validatorData', type: 'bytes' },
        { name: 'hookData', type: 'bytes' },
        { name: 'selectorData', type: 'bytes' },
      ],
    },
    primaryType: 'Enable',
    message: {
      validationId: '0x000000000000000000000000000000000000000000',
      nonce: 0,
      hook: '0x0000000000000000000000000000000000000000',
      validatorData: VALID_VALIDATOR_DATA,
      hookData: '0x',
      selectorData: '0x',
    },
    ...overrides,
  };
}

function makeSerializedApproval(accountAddress: Address): string {
  const params = {
    enableSignature: '0xdeadbeefdeadbeef',
    accountParams: { accountAddress },
    permissionParams: { permissionId: '0x00000000' },
    action: {
      selector: '0x00000000',
      address: '0x0000000000000000000000000000000000000000',
    },
    kernelVersion: '0.3.1',
    validatorData: VALID_VALIDATOR_DATA,
    hookData: '0x',
  };
  return Buffer.from(JSON.stringify(params)).toString('base64');
}

function makeApprovalPayload(
  accountAddress: Address,
  overrides?: Partial<SessionApprovalPayload>
): SessionApprovalPayload {
  return {
    approval: makeSerializedApproval(accountAddress),
    chainId: CHAIN_ID,
    typedData: makeTypedData(),
    ...overrides,
  };
}

// --- Tests ---

describe('verifySessionApproval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('accepts valid approval where recovered owner matches claimed account', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_ADDRESS);
    mockComputeSmartAccountAddress.mockReturnValue(SMART_ACCOUNT_ADDRESS);

    const result = await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      SMART_ACCOUNT_ADDRESS
    );

    expect(result.valid).toBe(true);
    expect(result.ownerAddress).toBe(OWNER_ADDRESS);
    expect(result.sessionKeyAddress).toBe(SESSION_KEY_ADDRESS.toLowerCase());
  });

  test('rejects when claimed account does not match approval accountAddress', async () => {
    const otherAccount =
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address;

    const result = await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      otherAccount
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe('account_mismatch');
  });

  test('rejects when verifyingContract does not match claimed account', async () => {
    const victimAccount =
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as Address;

    const payload = makeApprovalPayload(victimAccount, {
      typedData: makeTypedData({
        domain: {
          name: 'Kernel',
          version: '0.3.1',
          chainId: CHAIN_ID,
          verifyingContract: SMART_ACCOUNT_ADDRESS, // doesn't match victimAccount
        },
      }),
    });
    payload.approval = makeSerializedApproval(victimAccount);

    const result = await verifySessionApproval(payload, victimAccount);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('verifying_contract_mismatch');
  });

  test('rejects when typedData is missing', async () => {
    const payload = makeApprovalPayload(SMART_ACCOUNT_ADDRESS);
    delete (payload as Partial<SessionApprovalPayload>).typedData;

    const result = await verifySessionApproval(payload, SMART_ACCOUNT_ADDRESS);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('typed_data_required');
  });

  test('rejects when chain ID mismatches between payload and typedData', async () => {
    const payload = makeApprovalPayload(SMART_ACCOUNT_ADDRESS, {
      chainId: 1, // mainnet, but typedData says 42161
    });

    const result = await verifySessionApproval(payload, SMART_ACCOUNT_ADDRESS);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('chain_id_mismatch');
  });

  test('rejects invalid approval format (bad base64)', async () => {
    const payload: SessionApprovalPayload = {
      approval: '!!!not-valid-base64!!!',
      chainId: CHAIN_ID,
      typedData: makeTypedData(),
    };

    const result = await verifySessionApproval(payload, SMART_ACCOUNT_ADDRESS);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_approval_format');
  });

  test('rejects when signature recovery fails', async () => {
    mockRecoverTypedDataAddress.mockRejectedValue(
      new Error('invalid signature')
    );

    const result = await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      SMART_ACCOUNT_ADDRESS
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe('invalid_signature');
  });
});

describe('parseZeroDevApproval', () => {
  test('parses valid base64-encoded approval', () => {
    const serialized = makeSerializedApproval(SMART_ACCOUNT_ADDRESS);
    const parsed = parseZeroDevApproval(serialized);

    expect(parsed).not.toBeNull();
    expect(parsed!.accountAddress).toBe(SMART_ACCOUNT_ADDRESS);
    expect(parsed!.enableSignature).toBe('0xdeadbeefdeadbeef');
  });

  test('returns null for invalid JSON', () => {
    const bad = Buffer.from('not json').toString('base64');
    expect(parseZeroDevApproval(bad)).toBeNull();
  });

  test('returns null when enableSignature is missing', () => {
    const params = { accountParams: { accountAddress: SMART_ACCOUNT_ADDRESS } };
    const serialized = Buffer.from(JSON.stringify(params)).toString('base64');
    expect(parseZeroDevApproval(serialized)).toBeNull();
  });
});

describe('extractSessionKeyFromValidatorData', () => {
  test('extracts session key from valid validatorData', () => {
    const result = extractSessionKeyFromValidatorData(VALID_VALIDATOR_DATA);
    expect(result).toBe(SESSION_KEY_ADDRESS.toLowerCase());
  });

  test('returns null for empty validatorData', () => {
    expect(extractSessionKeyFromValidatorData(EMPTY_VALIDATOR_DATA)).toBeNull();
  });
});

describe('verifySessionApproval — smart account ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('rejects when recovered owner does not own claimed smart account', async () => {
    const DIFFERENT_ADDRESS =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_ADDRESS);
    mockComputeSmartAccountAddress.mockReturnValue(DIFFERENT_ADDRESS);

    const result = await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      SMART_ACCOUNT_ADDRESS
    );

    expect(result.valid).toBe(false);
    expect(result.error).toBe('smart_account_ownership_mismatch');
  });

  test('accepts when recovered owner owns claimed smart account', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_ADDRESS);
    mockComputeSmartAccountAddress.mockReturnValue(SMART_ACCOUNT_ADDRESS);

    const result = await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      SMART_ACCOUNT_ADDRESS
    );

    expect(result.valid).toBe(true);
    expect(result.ownerAddress).toBe(OWNER_ADDRESS);
  });

  test('ownership check always runs (not gated by DI)', async () => {
    mockRecoverTypedDataAddress.mockResolvedValue(OWNER_ADDRESS);
    mockComputeSmartAccountAddress.mockReturnValue(SMART_ACCOUNT_ADDRESS);

    // Call without any third arg — ownership check should still run
    await verifySessionApproval(
      makeApprovalPayload(SMART_ACCOUNT_ADDRESS),
      SMART_ACCOUNT_ADDRESS
    );

    expect(mockComputeSmartAccountAddress).toHaveBeenCalledWith(OWNER_ADDRESS);
  });
});
