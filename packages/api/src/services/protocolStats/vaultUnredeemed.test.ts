import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    prediction: { findMany: vi.fn() },
    claim: { findMany: vi.fn() },
    close: { findMany: vi.fn() },
  },
}));

vi.mock('../../core/db', () => ({ default: mockPrisma }));

vi.mock('../../../generated/prisma', () => ({
  SettlementResult: {
    UNRESOLVED: 'UNRESOLVED',
    PREDICTOR_WINS: 'PREDICTOR_WINS',
    COUNTERPARTY_WINS: 'COUNTERPARTY_WINS',
    NON_DECISIVE: 'NON_DECISIVE',
  },
}));

const VAULT = '0xvault';
vi.mock('./vaultConfig', () => ({
  resolveVaultAddress: (_chainId: number, arg?: string) =>
    (arg ?? VAULT).toLowerCase(),
}));

const { calculateVaultUnredeemedClaim } = await import('./vaultUnredeemed');

describe('calculateVaultUnredeemedClaim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.close.findMany.mockResolvedValue([]);
  });

  it('counts total collateral on the winning side, net of Claim redemptions', async () => {
    // counterparty win: predictor 1.75 + counterparty 97.45 → owed 99.2
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([
        {
          predictorCollateral: '1750000000000000000',
          counterpartyCollateral: '97450000000000000000',
          pickConfigId: '0xpc1',
        },
      ]) // counterpartyWins
      .mockResolvedValueOnce([]); // predictorWins
    mockPrisma.claim.findMany.mockResolvedValue([]);

    expect(await calculateVaultUnredeemedClaim(1)).toBe(
      99_200_000_000_000_000_000n
    );

    // Now the vault has redeemed it via redeem() → Claim of 99.2.
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([
        {
          predictorCollateral: '1750000000000000000',
          counterpartyCollateral: '97450000000000000000',
          pickConfigId: '0xpc1',
        },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.claim.findMany.mockResolvedValue([
      { collateralPaid: '99200000000000000000' },
    ]);

    expect(await calculateVaultUnredeemedClaim(1)).toBe(0n);
  });

  it('also nets out wins settled via the bilateral burn path (Close), not just Claim', async () => {
    // Vault won pickConfig 0xpc1 (owed 99.2) but exited via burn() → Close,
    // whose counterpartyPayout (99.2, vault is the counterparty holder) is
    // already in vaultRealizedPnL. Without netting it here it'd double-count.
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([
        {
          predictorCollateral: '1750000000000000000',
          counterpartyCollateral: '97450000000000000000',
          pickConfigId: '0xpc1',
        },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([
      {
        predictorHolder: '0xsomeoneelse',
        counterpartyHolder: VAULT,
        predictorPayout: '0',
        counterpartyPayout: '99200000000000000000',
      },
    ]);

    expect(await calculateVaultUnredeemedClaim(1)).toBe(0n);
  });

  it('clamps at 0n when redemptions exceed the owed amount', async () => {
    mockPrisma.prediction.findMany
      .mockResolvedValueOnce([]) // counterpartyWins
      .mockResolvedValueOnce([]); // predictorWins
    mockPrisma.claim.findMany.mockResolvedValue([
      { collateralPaid: '5000000000000000000' },
    ]);
    expect(await calculateVaultUnredeemedClaim(1)).toBe(0n);
  });
});
