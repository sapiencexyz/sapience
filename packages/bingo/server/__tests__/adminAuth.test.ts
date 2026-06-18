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
  getPublicClient: () => ({ readContract, verifySiweMessage: async () => true }),
}));

vi.mock('../chain.js', () => ({
  sponsorAddress: () => SPONSOR,
}));

vi.mock('viem/siwe', () => ({ parseSiweMessage: vi.fn() }));
import { parseSiweMessage } from 'viem/siwe';

vi.mock('../config.js', () => ({
  env: {
    SERVER_SECRET: `0x${'00'.repeat(31)}01`,
    ADMIN_ADDRESS: '',
    ADMIN_ADDRESSES: `${VIEWER},${VIEWER}`,
  },
}));

import {
  issueNonce,
  isValidAdminSession,
  resolveAdminAddresses,
  siweLogin,
} from '../adminAuth.js';

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

describe('admin session tokens are network-scoped', () => {
  beforeEach(() => {
    readContract.mockReset();
    // Treasury owner() for either receipt; allowlist resolves on both networks.
    readContract.mockImplementation(
      async (args: { address: Address; functionName: string }) => {
        if (args.functionName === 'owner' && args.address !== SPONSOR) {
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

  async function tokenFor(network: 'staging' | 'main'): Promise<string> {
    mockParsed(network);
    const { token } = await siweLogin(network, 'siwe-message', '0xsig', DOMAIN);
    return token;
  }

  it('accepts a token on the network that issued it', async () => {
    const token = await tokenFor('staging');
    expect(isValidAdminSession(token, 'staging')).toBe(true);
  });

  it('rejects a token replayed against the other network', async () => {
    const token = await tokenFor('staging');
    expect(isValidAdminSession(token, 'main')).toBe(false);
  });
});

// The signed SIWE message itself (not just the bearer token) must be bound to
// this origin + chain, else a message phished on another site/chain is replayable.
const DOMAIN = 'bingo.example';
const CHAIN_ID_BY_NETWORK = { staging: 13374202, main: 5064014 } as const;

function mockParsed(
  network: 'staging' | 'main',
  overrides: Record<string, unknown> = {},
): void {
  vi.mocked(parseSiweMessage).mockReturnValue({
    nonce: issueNonce(),
    address: TREASURY,
    chainId: CHAIN_ID_BY_NETWORK[network],
    domain: DOMAIN,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe('SIWE login binds the signed message to origin + chain', () => {
  beforeEach(() => {
    readContract.mockReset();
    readContract.mockImplementation(
      async (args: { address: Address; functionName: string }) => {
        if (args.functionName === 'owner' && args.address !== SPONSOR) {
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

  it('accepts a message matching the serving domain + network chain', async () => {
    mockParsed('staging');
    await expect(
      siweLogin('staging', 'msg', '0xsig', DOMAIN),
    ).resolves.toMatchObject({ address: TREASURY });
  });

  it('rejects a message signed for the wrong chainId', async () => {
    mockParsed('staging', { chainId: CHAIN_ID_BY_NETWORK.main });
    await expect(siweLogin('staging', 'msg', '0xsig', DOMAIN)).rejects.toThrow(
      /chain/i,
    );
  });

  it('rejects a message whose domain != the serving origin', async () => {
    mockParsed('staging');
    await expect(
      siweLogin('staging', 'msg', '0xsig', 'evil.example'),
    ).rejects.toThrow(/domain/i);
  });
});
