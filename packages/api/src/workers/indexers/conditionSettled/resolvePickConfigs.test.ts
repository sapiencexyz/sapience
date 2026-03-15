import { describe, it, expect, vi } from 'vitest';
import {
  computeSettlementResult,
  resolvePickConfigsForCondition,
} from './resolvePickConfigs';

// --- computeSettlementResult tests ---

describe('computeSettlementResult', () => {
  const cond = (id: string, resolvedToYes: boolean, nonDecisive = false) => ({
    id,
    settled: true,
    resolvedToYes,
    nonDecisive,
  });

  // OutcomeSide: YES = 0, NO = 1 (matches IV2Types.sol)

  it('returns PREDICTOR_WINS when single pick predicted YES and condition resolved YES', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 0 }];
    const map = new Map([['c1', cond('c1', true)]]);
    expect(computeSettlementResult(picks, map)).toBe('PREDICTOR_WINS');
  });

  it('returns PREDICTOR_WINS when single pick predicted NO and condition resolved NO', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 1 }];
    const map = new Map([['c1', cond('c1', false)]]);
    expect(computeSettlementResult(picks, map)).toBe('PREDICTOR_WINS');
  });

  it('returns COUNTERPARTY_WINS when single pick predicted YES but condition resolved NO', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 0 }];
    const map = new Map([['c1', cond('c1', false)]]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('returns COUNTERPARTY_WINS when single pick predicted NO but condition resolved YES', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 1 }];
    const map = new Map([['c1', cond('c1', true)]]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('returns PREDICTOR_WINS when all multi-picks are correct', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: 0 },
      { conditionId: 'c2', predictedOutcome: 1 },
    ];
    const map = new Map([
      ['c1', cond('c1', true)],
      ['c2', cond('c2', false)],
    ]);
    expect(computeSettlementResult(picks, map)).toBe('PREDICTOR_WINS');
  });

  it('returns COUNTERPARTY_WINS when one of multi-picks is wrong', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: 0 },
      { conditionId: 'c2', predictedOutcome: 0 },
    ];
    const map = new Map([
      ['c1', cond('c1', true)],
      ['c2', cond('c2', false)],
    ]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('returns COUNTERPARTY_WINS when condition is non-decisive (tie)', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 0 }];
    const map = new Map([['c1', cond('c1', false, true)]]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('returns COUNTERPARTY_WINS when any condition is non-decisive even if others match', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: 0 },
      { conditionId: 'c2', predictedOutcome: 1 },
    ];
    const map = new Map([
      ['c1', cond('c1', true)],
      ['c2', cond('c2', false, true)],
    ]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('returns null when condition is missing from map', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: 1 }];
    const map = new Map<
      string,
      {
        id: string;
        settled: boolean;
        resolvedToYes: boolean;
        nonDecisive: boolean;
      }
    >();
    expect(computeSettlementResult(picks, map)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Pyth Over/Under settlement mapping
  //
  // On-chain PythConditionResolver:
  //   Over  → payoutNumerators [1,0] → YES = 0
  //   Under → payoutNumerators [0,1] → NO  = 1
  //
  // MarketSettled event:
  //   resolvedToOver: true  → resolvedToYes: true
  //   resolvedToOver: false → resolvedToYes: false
  // -------------------------------------------------------------------------

  it('Pyth Over pick (predictedOutcome=0) wins when resolvedToYes=true (Over won)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 0 }];
    const map = new Map([['pyth-1', cond('pyth-1', true)]]);
    expect(computeSettlementResult(picks, map)).toBe('PREDICTOR_WINS');
  });

  it('Pyth Over pick (predictedOutcome=0) loses when resolvedToYes=false (Under won)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 0 }];
    const map = new Map([['pyth-1', cond('pyth-1', false)]]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });

  it('Pyth Under pick (predictedOutcome=1) wins when resolvedToYes=false (Under won)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 1 }];
    const map = new Map([['pyth-1', cond('pyth-1', false)]]);
    expect(computeSettlementResult(picks, map)).toBe('PREDICTOR_WINS');
  });

  it('Pyth Under pick (predictedOutcome=1) loses when resolvedToYes=true (Over won)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 1 }];
    const map = new Map([['pyth-1', cond('pyth-1', true)]]);
    expect(computeSettlementResult(picks, map)).toBe('COUNTERPARTY_WINS');
  });
});

// --- resolvePickConfigsForCondition tests ---

function createMockTx(overrides: Record<string, unknown> = {}) {
  return {
    picks: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    condition: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as Parameters<typeof resolvePickConfigsForCondition>[0];
}

describe('resolvePickConfigsForCondition', () => {
  it('does nothing when no unresolved pickConfigs reference the condition', async () => {
    const tx = createMockTx();
    await resolvePickConfigsForCondition(tx, 'cond1', 1000);
    expect(tx.picks.update).not.toHaveBeenCalled();
  });

  it('does not resolve when not all conditions are settled', async () => {
    const tx = createMockTx({
      picks: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pc1',
            picks: [
              { conditionId: 'c1', predictedOutcome: 1 },
              { conditionId: 'c2', predictedOutcome: 0 },
            ],
          },
        ]),
        update: vi.fn(),
      },
      condition: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', settled: true, resolvedToYes: true, nonDecisive: false },
          {
            id: 'c2',
            settled: false,
            resolvedToYes: false,
            nonDecisive: false,
          },
        ]),
      },
    });

    await resolvePickConfigsForCondition(tx, 'c1', 1000);
    expect(tx.picks.update).not.toHaveBeenCalled();
  });

  it('resolves to PREDICTOR_WINS when all conditions settled and all picks correct', async () => {
    const tx = createMockTx({
      picks: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pc1',
            picks: [
              { conditionId: 'c1', predictedOutcome: 0 },
              { conditionId: 'c2', predictedOutcome: 1 },
            ],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      condition: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', settled: true, resolvedToYes: true, nonDecisive: false },
          { id: 'c2', settled: true, resolvedToYes: false, nonDecisive: false },
        ]),
      },
    });

    await resolvePickConfigsForCondition(tx, 'c1', 1000);
    expect(tx.picks.update).toHaveBeenCalledWith({
      where: { id: 'pc1' },
      data: {
        resolved: true,
        result: 'PREDICTOR_WINS',
        resolvedAt: 1000,
      },
    });
  });

  it('resolves to COUNTERPARTY_WINS when a pick is wrong', async () => {
    const tx = createMockTx({
      picks: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pc1',
            picks: [
              { conditionId: 'c1', predictedOutcome: 1 },
              { conditionId: 'c2', predictedOutcome: 1 },
            ],
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      condition: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'c1', settled: true, resolvedToYes: true, nonDecisive: false },
          { id: 'c2', settled: true, resolvedToYes: false, nonDecisive: false },
        ]),
      },
    });

    await resolvePickConfigsForCondition(tx, 'c1', 1000);
    expect(tx.picks.update).toHaveBeenCalledWith({
      where: { id: 'pc1' },
      data: {
        resolved: true,
        result: 'COUNTERPARTY_WINS',
        resolvedAt: 1000,
      },
    });
  });

  it('skips pickConfig when condition is missing from DB', async () => {
    const tx = createMockTx({
      picks: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pc1',
            picks: [{ conditionId: 'c1', predictedOutcome: 1 }],
          },
        ]),
        update: vi.fn(),
      },
      condition: {
        findMany: vi.fn().mockResolvedValue([]), // condition not found
      },
    });

    await resolvePickConfigsForCondition(tx, 'c1', 1000);
    expect(tx.picks.update).not.toHaveBeenCalled();
  });
});
