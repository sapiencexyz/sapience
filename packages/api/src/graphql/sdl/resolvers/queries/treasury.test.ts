import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { contracts } from '@sapience/sdk/contracts';
import {
  fromGlobalId,
  toGlobalId,
  registeredNodeTypes,
} from '../../../relay/globalId';
import { encodeCursor } from '../../../relay/cursor';

const mockPrisma = vi.hoisted(() => ({
  collateralTransfer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  category: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import {
  collateralTransfersConnection,
  collateralBalance,
} from './collateralBalance';
import { categoriesConnection } from './crud';
import { protocol, vaultsConnection } from './analytics';

const TESTNET = 13374202;
const ACCOUNT = '0x000000000000000000000000000000000000aaaa';
const VAULT = contracts.predictionMarketVault[TESTNET].address.toLowerCase();
const SCHEMA = readFileSync(
  join(__dirname, '../../schema/schema.graphql'),
  'utf8'
);
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

describe('treasury — SDL guardrails', () => {
  it('removes deleted page fields and page wrapper types from the public schema', () => {
    expect(SCHEMA).not.toContain('collateralTransfersPage');
    expect(SCHEMA).not.toContain('categoriesPage');
    expect(SCHEMA).not.toContain('type CollateralTransfersPage');
    expect(SCHEMA).not.toContain('type CategoriesPage');
  });

  it('keeps protocol OI fields live and root OI fields deprecated toward protocol namespace', () => {
    expect(SCHEMA).toMatch(
      /type Protocol[\s\S]*openInterestByCategory: \[CategoryOpenInterest!\]!\n(?!\s*@deprecated)/
    );
    expect(SCHEMA).toMatch(
      /type Protocol[\s\S]*openInterestByTimeToResolution: \[TimeToResolutionBucket!\]!\n(?!\s*@deprecated)/
    );
    expect(SCHEMA).toMatch(
      /type Query[\s\S]*openInterestByCategory: \[CategoryOpenInterest!\]!\n\s*@deprecated\(reason: "Use `protocol\.openInterestByCategory`\."\)/
    );
    expect(SCHEMA).toMatch(
      /type Query[\s\S]*openInterestByTimeToResolution: \[TimeToResolutionBucket!\]!\n\s*@deprecated\(reason: "Use `protocol\.openInterestByTimeToResolution`\."\)/
    );
  });

  it('does not expose unimplemented stats pagination or ordering args yet', () => {
    expect(SCHEMA).toMatch(
      /stats\(filter: ProtocolStatFilter\): ProtocolStatConnection!/
    );
    expect(SCHEMA).toMatch(
      /stats\(filter: VaultStatFilter\): VaultStatConnection!/
    );
    expect(SCHEMA).not.toContain('input ProtocolStatOrder');
    expect(SCHEMA).not.toContain('input VaultStatOrder');
  });

  it('uses flat collateral transfer filters and only index-backed block-number ordering', () => {
    expect(SCHEMA).toMatch(
      /input CollateralTransferFilter \{\n\s*account: Address\n\s*chainId: Int\n\s*timestamp: DateTimeFilter\n\s*transactionHash: Bytes32\n\}/
    );
    expect(SCHEMA).toMatch(
      /enum CollateralTransferOrderField \{\n\s*BLOCK_NUMBER\n\}/
    );
    expect(SCHEMA).not.toContain('AMOUNT');
  });
});

describe('treasury — Node identity', () => {
  it('keeps Vault and Account as registered Node types (CollateralTransfer and Category were unwound for back-compat)', () => {
    expect(registeredNodeTypes()).toEqual(
      expect.arrayContaining(['Vault', 'Account'])
    );
    expect(registeredNodeTypes()).not.toContain('CollateralTransfer');
    expect(registeredNodeTypes()).not.toContain('Category');
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

describe('treasury — collateral surface', () => {
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

  it('collateralTransfersConnection uses flat filters and account synthesis', async () => {
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
        filter: { account: ACCOUNT, chainId: TESTNET },
      },
      {} as never,
      null as never
    );
    expect(mockPrisma.collateralTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: TESTNET,
          OR: [{ from: ACCOUNT }, { to: ACCOUNT }],
        }),
      })
    );
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      account: { address: ACCOUNT },
      amount: '42',
      transactionHash: '0xabc',
    });
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it('applies cursor pagination against blockNumber plus id for stable ordering', async () => {
    const cursor = encodeCursor({ k: '123', id: '7' });
    await callResolver(collateralTransfersConnection)(
      null,
      {
        first: 10,
        after: cursor,
        filter: { account: ACCOUNT, chainId: TESTNET },
        orderBy: { field: 'BLOCK_NUMBER', direction: 'DESC' },
      },
      {} as never,
      null as never
    );
    expect(mockPrisma.collateralTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: [
                { blockNumber: { lt: 123 } },
                {
                  AND: [{ blockNumber: { equals: 123 } }, { id: { lt: 7 } }],
                },
              ],
            }),
          ]),
        }),
        orderBy: [{ blockNumber: 'desc' }, { id: 'desc' }],
      })
    );
  });
});

describe('treasury — protocol/vault/categories surface', () => {
  it('exposes protocol namespace resolvers', async () => {
    const p = await callResolver(protocol)(
      null,
      {},
      {} as never,
      null as never
    );
    expect(p).toEqual({});
  });

  it('vaultsConnection resolves by address with lowercase Vault node id', async () => {
    const result = await callResolver<{
      nodes: Array<{
        id: string;
        address: string;
        chainId: number;
        account: { address: string };
      }>;
      totalCount: number;
    }>(vaultsConnection)(
      null,
      { filter: { address: VAULT.toUpperCase(), chainId: TESTNET } },
      {} as never,
      null as never
    );
    expect(result.totalCount).toBe(1);
    expect(result.nodes[0]).toMatchObject({
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
      nodes: Array<{ id: number }>;
    }>(categoriesConnection)(null, { first: 10 }, {} as never, null as never);
    expect(result.totalCount).toBe(1);
    expect(result.nodes[0].id).toBe(5);
  });
});
