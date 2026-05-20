import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  fromGlobalId,
  toGlobalId,
  registeredNodeTypes,
} from '../../../relay/globalId';
import { contracts } from '@sapience/sdk/contracts';

const mockPrisma = vi.hoisted(() => ({
  collateralTransfer: { findMany: vi.fn(), findUnique: vi.fn() },
  category: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import {
  collateralTransfersConnection,
  collateralBalance,
} from './collateralBalance';
import { categoriesConnection } from './crud';
import { protocol, vaultByAddress } from './analytics';

const TESTNET = 13374202;
const ACCOUNT = '0x000000000000000000000000000000000000aaaa';
const VAULT = contracts.predictionMarketVault[TESTNET].address.toLowerCase();
type TestResolver<TResult = unknown> = (
  ...args: unknown[]
) => TResult | Promise<TResult>;
const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as TestResolver<TResult>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.collateralTransfer.findMany.mockResolvedValue([]);
  mockPrisma.category.findMany.mockResolvedValue([]);
  mockPrisma.category.count.mockResolvedValue(0);
  mockPrisma.$queryRaw.mockResolvedValue([{ balance: '0' }]);
});

describe('PR5 Node identity', () => {
  it('freezes CollateralTransfer, Vault, and Category node types', () => {
    expect(registeredNodeTypes()).toEqual(
      expect.arrayContaining(['CollateralTransfer', 'Vault', 'Category'])
    );
  });

  it('encodes CollateralTransfer as chainId:transactionHash:logIndex', () => {
    const id = toGlobalId('CollateralTransfer', `${TESTNET}:0xabc:7`);
    expect(fromGlobalId(id)).toEqual({
      type: 'CollateralTransfer',
      id: `${TESTNET}:0xabc:7`,
    });
  });

  it('encodes Vault as chainId:lowercaseAddress', () => {
    const id = toGlobalId(
      'Vault',
      `${TESTNET}:${VAULT.toUpperCase()}`.toLowerCase()
    );
    expect(fromGlobalId(id)).toEqual({
      type: 'Vault',
      id: `${TESTNET}:${VAULT}`,
    });
  });
});

describe('PR5 collateral surface', () => {
  it('collateralBalance returns account-backed amount shape', async () => {
    const result = await callResolver(collateralBalance)(
      null,
      { account: ACCOUNT, chainId: TESTNET },
      {} as never,
      null as never
    );
    expect(result).toMatchObject({
      chainId: TESTNET,
      amount: '0',
      account: { address: ACCOUNT },
      collateral: { chainId: TESTNET },
    });
  });

  it('collateralTransfersConnection uses Relay pagination and account synthesis', async () => {
    const row = {
      chainId: TESTNET,
      blockNumber: 123,
      timestamp: new Date('2026-01-01T00:00:00Z'),
      transactionHash: '0xabc',
      logIndex: 7,
      from: ACCOUNT,
      to: VAULT,
      value: '42',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    mockPrisma.collateralTransfer.findMany.mockResolvedValue([row]);
    const result = await callResolver<{
      nodes: Array<{
        id: string;
        account: { address: string };
        amount: string;
        transactionHash: string;
      }>;
      pageInfo: { hasNextPage: boolean };
    }>(collateralTransfersConnection)(
      null,
      {
        first: 10,
        filter: { account: { equals: ACCOUNT }, chainId: { equals: TESTNET } },
      },
      {} as never,
      null as never
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: toGlobalId('CollateralTransfer', `${TESTNET}:0xabc:7`),
      account: { address: ACCOUNT },
      amount: '42',
      transactionHash: '0xabc',
    });
    expect(result.pageInfo.hasNextPage).toBe(false);
  });
});

describe('PR5 protocol/vault/categories surface', () => {
  it('exposes protocol namespace resolvers', async () => {
    const p = await callResolver(protocol)(
      null,
      {},
      {} as never,
      null as never
    );
    expect(p).toEqual({});
  });

  it('resolves vaultByAddress with lowercase Vault node id', async () => {
    const vault = await callResolver(vaultByAddress)(
      null,
      { address: VAULT.toUpperCase(), chainId: TESTNET },
      {} as never,
      null as never
    );
    expect(vault).toMatchObject({
      id: toGlobalId('Vault', `${TESTNET}:${VAULT}`),
      address: VAULT,
      chainId: TESTNET,
      account: { address: VAULT },
    });
  });

  it('categoriesConnection includes cheap totalCount', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 5, name: 'Macro', slug: 'macro', createdAt: new Date() },
    ]);
    mockPrisma.category.count.mockResolvedValue(1);
    const result = await callResolver<{
      totalCount: number;
      nodes: Array<{ id: string }>;
    }>(categoriesConnection)(null, { first: 10 }, {} as never, null as never);
    expect(result.totalCount).toBe(1);
    expect(result.nodes[0].id).toBe(toGlobalId('Category', '5'));
  });
});
