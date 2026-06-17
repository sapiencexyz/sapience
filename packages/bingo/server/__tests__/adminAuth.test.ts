import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';

const {
  TREASURY,
  BUDGET_MANAGER,
  SPONSOR_OWNER,
  VIEWER,
  SPONSOR,
  RECEIPT_MAIN,
  RECEIPT_STAGING,
  readContract,
} = vi.hoisted(() => {
  const TREASURY = '0x1111111111111111111111111111111111111111' as Address;
  const BUDGET_MANAGER = '0x2222222222222222222222222222222222222222' as Address;
  const SPONSOR_OWNER = '0x3333333333333333333333333333333333333333' as Address;
  const VIEWER = '0x4444444444444444444444444444444444444444' as Address;
  const SPONSOR = '0x5555555555555555555555555555555555555555' as Address;
  const RECEIPT_MAIN = '0xdb89F60983C7f943FD683Da0c3F6418d38e3732d' as Address;
  const RECEIPT_STAGING = '0x67fB8B733Fe4E523d7d491785A86748a4ee9112c' as Address;
  const readContract = vi.fn();
  return {
    TREASURY,
    BUDGET_MANAGER,
    SPONSOR_OWNER,
    VIEWER,
    SPONSOR,
    RECEIPT_MAIN,
    RECEIPT_STAGING,
    readContract,
  };
});

vi.mock('../session.js', () => ({
  getPublicClient: () => ({ readContract }),
}));

vi.mock('../chain.js', () => ({
  sponsorAddress: () => SPONSOR,
}));

vi.mock('../config.js', () => ({
  env: {
    SERVER_SECRET: `0x${'00'.repeat(31)}01`,
    ADMIN_ADDRESS: '',
    ADMIN_ADDRESSES: `${VIEWER},${VIEWER}`,
  },
}));

import { resolveAdminAddresses } from '../adminAuth.js';

describe('resolveAdminAddresses', () => {
  beforeEach(() => {
    readContract.mockReset();
    readContract.mockImplementation(
      async (args: { address: Address; functionName: string }) => {
        if (
          (args.address === RECEIPT_MAIN ||
            args.address === RECEIPT_STAGING) &&
          args.functionName === 'owner'
        ) {
          return TREASURY;
        }
        if (args.address === SPONSOR && args.functionName === 'budgetManager') {
          return BUDGET_MANAGER;
        }
        if (args.address === SPONSOR && args.functionName === 'owner') {
          return SPONSOR_OWNER;
        }
        throw new Error(`unexpected readContract: ${args.functionName}`);
      },
    );
  });

  it('includes treasury, sponsor roles, and view-only env extras', async () => {
    const addrs = await resolveAdminAddresses('main');
    const lower = addrs.map((a) => a.toLowerCase());
    expect(lower).toContain(TREASURY.toLowerCase());
    expect(lower).toContain(BUDGET_MANAGER.toLowerCase());
    expect(lower).toContain(SPONSOR_OWNER.toLowerCase());
    expect(lower).toContain(VIEWER.toLowerCase());
    expect(lower.filter((a) => a === VIEWER.toLowerCase())).toHaveLength(1);
  });

  it('reads sponsor budgetManager and owner from chain', async () => {
    await resolveAdminAddresses('staging');
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: SPONSOR,
        functionName: 'budgetManager',
      }),
    );
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: SPONSOR,
        functionName: 'owner',
      }),
    );
  });
});
