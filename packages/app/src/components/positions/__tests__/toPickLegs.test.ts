import { describe, it, expect } from 'vitest';
import { OutcomeSide } from '@sapience/sdk/types';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '../toPickLegs';
import { getPythMarketId } from '@sapience/sdk';
import { pythConditionResolver } from '@sapience/sdk/contracts';
import type { PickData } from '~/hooks/graphql/usePositions';

// ---------------------------------------------------------------------------
// Helpers — generic
// ---------------------------------------------------------------------------

type ConditionEntry = NonNullable<ReturnType<ConditionsMap['get']>>;

function makeConditionsMap(
  entries: Array<[string, Partial<ConditionEntry>]>
): ConditionsMap {
  return new Map(
    entries.map(([k, v]) => [
      k,
      {
        question: v.question ?? null,
        shortName: v.shortName ?? null,
        endTime: v.endTime ?? null,
        resolver: v.resolver ?? null,
        category: v.category ?? null,
        settled: v.settled ?? false,
        resolvedToYes: v.resolvedToYes ?? false,
        nonDecisive: v.nonDecisive ?? false,
      },
    ])
  );
}

// ---------------------------------------------------------------------------
// Helpers — Pyth
// ---------------------------------------------------------------------------

/** A known Pyth condition resolver address (Ethereal testnet) */
const PYTH_RESOLVER = pythConditionResolver[13374202]!.address;

/** ETH feed = Lazer ID 2 → PYTH_FEED_NAMES[2] = "ETH" */
const ETH_PRICE_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000002' as const;

/** An unknown feed ID that won't appear in PYTH_FEED_NAMES */
const UNKNOWN_PRICE_ID =
  '0x00000000000000000000000000000000000000000000000000000000deadbeef' as const;

const STRIKE_PRICE = 250000n; // 2500.00 with expo -2
const STRIKE_EXPO = -2;
const END_TIME = 1710428400n; // 2024-03-14 ~13:40 UTC

function makePythConditionId(
  priceId: `0x${string}` = ETH_PRICE_ID,
  opts?: {
    strikePrice?: bigint;
    strikeExpo?: number;
    endTime?: bigint;
    overWinsOnTie?: boolean;
  }
) {
  return getPythMarketId({
    priceId,
    endTime: opts?.endTime ?? END_TIME,
    strikePrice: opts?.strikePrice ?? STRIKE_PRICE,
    strikeExpo: opts?.strikeExpo ?? STRIKE_EXPO,
    overWinsOnTie: opts?.overWinsOnTie ?? true,
  });
}

function makePickData(overrides: Partial<PickData> = {}): PickData {
  return {
    id: 1,
    pickConfigId: '0x01',
    conditionResolver: PYTH_RESOLVER,
    conditionId: makePythConditionId(),
    predictedOutcome: 0, // over = YES (on-chain: Over→[1,0]→YES=0)
    ...overrides,
  };
}

const emptyConditionsMap: ConditionsMap = new Map();

// ---------------------------------------------------------------------------
// Tests — generic toPicks
// ---------------------------------------------------------------------------

describe('toPicks', () => {
  const conditionsMap = makeConditionsMap([
    ['cond-1', { question: 'Will ETH hit 5k?' }],
  ]);

  const basePick = {
    id: 1,
    pickConfigId: 'pc-1',
    conditionResolver: '0xResolver',
    conditionId: 'cond-1',
    predictedOutcome: OutcomeSide.YES,
  };

  it('returns Pick with question from condition', () => {
    const result = toPicks([basePick], true, conditionsMap);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Will ETH hit 5k?');
    expect(result[0].conditionId).toBe('cond-1');
  });

  it('predictor side: YES -> "Yes"', () => {
    const result = toPicks([basePick], true, conditionsMap);
    expect(result[0].choice).toBe('Yes');
  });

  it('predictor side: NO -> "No"', () => {
    const pickNo = { ...basePick, predictedOutcome: OutcomeSide.NO };
    const result = toPicks([pickNo], true, conditionsMap);
    expect(result[0].choice).toBe('No');
  });

  it('counterparty side: YES -> "No"', () => {
    const result = toPicks([basePick], false, conditionsMap);
    expect(result[0].choice).toBe('No');
  });

  it('counterparty side: NO -> "Yes"', () => {
    const pickNo = { ...basePick, predictedOutcome: OutcomeSide.NO };
    const result = toPicks([pickNo], false, conditionsMap);
    expect(result[0].choice).toBe('Yes');
  });

  it('falls back to conditionId as question when condition not found', () => {
    const emptyMap = makeConditionsMap([]);
    const result = toPicks([basePick], true, emptyMap);
    expect(result[0].question).toBe('cond-1');
  });
});

// ---------------------------------------------------------------------------
// Tests — Pyth resolver picks
// ---------------------------------------------------------------------------

describe('toPicks — Pyth resolver picks', () => {
  it('returns Pick with source: "pyth"', () => {
    const picks = toPicks([makePickData()], true, emptyConditionsMap);

    expect(picks).toHaveLength(1);
    expect(picks[0].source).toBe('pyth');
  });

  it('choice is "Yes" or "No" (consistent with Polymarket)', () => {
    // Predictor side, predicted over (0=YES) → "Yes"
    const overPicks = toPicks(
      [makePickData({ predictedOutcome: 0 })],
      true,
      emptyConditionsMap
    );
    expect(overPicks[0].choice).toBe('Yes');

    // Predictor side, predicted under (1=NO) → "No"
    const underPicks = toPicks(
      [makePickData({ predictedOutcome: 1 })],
      true,
      emptyConditionsMap
    );
    expect(underPicks[0].choice).toBe('No');

    // Counterparty side flips
    const counterOverPicks = toPicks(
      [makePickData({ predictedOutcome: 0 })],
      false,
      emptyConditionsMap
    );
    expect(counterOverPicks[0].choice).toBe('No');
  });

  it('unknown feed still sets source: "pyth", priceFeedLabel is undefined', () => {
    const conditionId = makePythConditionId(UNKNOWN_PRICE_ID);
    const picks = toPicks(
      [makePickData({ conditionId })],
      true,
      emptyConditionsMap
    );

    expect(picks[0].source).toBe('pyth');
  });

  it('uses endTime from decoded market when conditionsMap has no entry', () => {
    const picks = toPicks([makePickData()], true, emptyConditionsMap);

    // endTime should come from decoded Pyth market params
    expect(picks[0].endTime).toBe(Number(END_TIME));
  });

  it('malformed conditionId with Pyth resolver still returns source: "pyth"', () => {
    const picks = toPicks(
      [makePickData({ conditionId: '0xdead' })],
      true,
      emptyConditionsMap
    );

    expect(picks[0].source).toBe('pyth');
    // Falls back to conditionId as question
    expect(picks[0].question).toBe('0xdead');
  });

  it('non-Pyth picks still use Yes/No choice', () => {
    const umaPick: PickData = {
      id: 2,
      pickConfigId: '0x02',
      conditionResolver: '0x1234567890123456789012345678901234567890',
      conditionId: '0x' + 'aa'.repeat(32),
      predictedOutcome: 0, // YES
    };
    const map: ConditionsMap = new Map([
      ['0x' + 'aa'.repeat(32), { question: 'Will it rain?' }],
    ]);
    const picks = toPicks([umaPick], true, map);

    expect(picks[0].choice).toBe('Yes');
    expect(picks[0].source).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — computeResultFromConditions
// ---------------------------------------------------------------------------

describe('computeResultFromConditions', () => {
  it('returns PREDICTOR_WINS when all picks resolved and matching', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: OutcomeSide.YES }];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: true }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('PREDICTOR_WINS');
    expect(result.allResolved).toBe(true);
  });

  it('returns COUNTERPARTY_WINS on pick loss', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: OutcomeSide.YES }];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: false }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });

  it('returns UNRESOLVED when picks are unsettled', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: OutcomeSide.YES }];
    const conditions = makeConditionsMap([['c1', { settled: false }]]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('UNRESOLVED');
    expect(result.allResolved).toBe(false);
  });

  it('returns COUNTERPARTY_WINS for non-decisive', () => {
    const picks = [{ conditionId: 'c1', predictedOutcome: OutcomeSide.YES }];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, nonDecisive: true }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });

  it('returns UNRESOLVED for empty picks', () => {
    const conditions = makeConditionsMap([]);
    const result = computeResultFromConditions([], conditions);
    expect(result.result).toBe('UNRESOLVED');
    expect(result.allResolved).toBe(false);
  });

  it('returns PREDICTOR_WINS when multiple picks all match', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: OutcomeSide.YES },
      { conditionId: 'c2', predictedOutcome: OutcomeSide.NO },
    ];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: true }],
      ['c2', { settled: true, resolvedToYes: false }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('PREDICTOR_WINS');
    expect(result.allResolved).toBe(true);
  });

  it('returns COUNTERPARTY_WINS if any pick in multi-pick loses', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: OutcomeSide.YES },
      { conditionId: 'c2', predictedOutcome: OutcomeSide.YES },
    ];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: true }],
      ['c2', { settled: true, resolvedToYes: false }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });
});

// ---------------------------------------------------------------------------
// Tests — Pyth settlement: end-to-end encoding → settlement mapping
//
// On-chain PythConditionResolver:
//   Over  → payoutNumerators [1,0] → OutcomeSide.YES = 0
//   Under → payoutNumerators [0,1] → OutcomeSide.NO  = 1
//
// MarketSettled event:
//   resolvedToOver: true  → resolvedToYes: true  (Over won → YES won)
//   resolvedToOver: false → resolvedToYes: false (Under won → NO won)
//
// These tests verify the full mapping is consistent.
// ---------------------------------------------------------------------------

describe('computeResultFromConditions — Pyth Over/Under settlement', () => {
  it('Over pick wins when market resolves to Over (resolvedToYes=true)', () => {
    // buildPythAuctionStartPayload: Over → predictedOutcome: 0 (YES)
    // processPythMarketSettled: resolvedToOver=true → resolvedToYes=true
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 0 }]; // Over = YES = 0
    const conditions = makeConditionsMap([
      ['pyth-1', { settled: true, resolvedToYes: true }], // Over won
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('PREDICTOR_WINS');
    expect(result.allResolved).toBe(true);
  });

  it('Over pick loses when market resolves to Under (resolvedToYes=false)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 0 }]; // Over = YES = 0
    const conditions = makeConditionsMap([
      ['pyth-1', { settled: true, resolvedToYes: false }], // Under won
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });

  it('Under pick wins when market resolves to Under (resolvedToYes=false)', () => {
    // buildPythAuctionStartPayload: Under → predictedOutcome: 1 (NO)
    // processPythMarketSettled: resolvedToOver=false → resolvedToYes=false
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 1 }]; // Under = NO = 1
    const conditions = makeConditionsMap([
      ['pyth-1', { settled: true, resolvedToYes: false }], // Under won
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('PREDICTOR_WINS');
    expect(result.allResolved).toBe(true);
  });

  it('Under pick loses when market resolves to Over (resolvedToYes=true)', () => {
    const picks = [{ conditionId: 'pyth-1', predictedOutcome: 1 }]; // Under = NO = 1
    const conditions = makeConditionsMap([
      ['pyth-1', { settled: true, resolvedToYes: true }], // Over won
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });

  it('mixed Pyth combo: Over+Under both correct → PREDICTOR_WINS', () => {
    const picks = [
      { conditionId: 'pyth-eth', predictedOutcome: 0 }, // Over ETH
      { conditionId: 'pyth-btc', predictedOutcome: 1 }, // Under BTC
    ];
    const conditions = makeConditionsMap([
      ['pyth-eth', { settled: true, resolvedToYes: true }], // ETH Over won
      ['pyth-btc', { settled: true, resolvedToYes: false }], // BTC Under won
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('PREDICTOR_WINS');
    expect(result.allResolved).toBe(true);
  });

  it('mixed Pyth combo: one leg wrong → COUNTERPARTY_WINS', () => {
    const picks = [
      { conditionId: 'pyth-eth', predictedOutcome: 0 }, // Over ETH
      { conditionId: 'pyth-btc', predictedOutcome: 0 }, // Over BTC
    ];
    const conditions = makeConditionsMap([
      ['pyth-eth', { settled: true, resolvedToYes: true }], // ETH Over won ✓
      ['pyth-btc', { settled: true, resolvedToYes: false }], // BTC Under won ✗
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });
});

// ---------------------------------------------------------------------------
// Tests — computeResultFromConditions edge cases
// ---------------------------------------------------------------------------

describe('computeResultFromConditions — edge cases', () => {
  it('treats missing condition in map as UNRESOLVED', () => {
    const picks = [
      { conditionId: 'missing', predictedOutcome: OutcomeSide.YES },
    ];
    const conditions = makeConditionsMap([]); // empty map
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('UNRESOLVED');
    expect(result.allResolved).toBe(false);
  });

  it('partial settlement: one resolved win + one missing → UNRESOLVED', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: OutcomeSide.YES },
      { conditionId: 'c2', predictedOutcome: OutcomeSide.NO },
    ];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: true }],
      // c2 missing from map entirely
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('UNRESOLVED');
    expect(result.allResolved).toBe(false);
  });

  it('decisive loss short-circuits even with unresolved picks remaining', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: OutcomeSide.YES },
      { conditionId: 'c2', predictedOutcome: OutcomeSide.YES },
    ];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, resolvedToYes: false }], // loss
      // c2 not settled yet
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });

  it('non-decisive short-circuits even with unresolved picks remaining', () => {
    const picks = [
      { conditionId: 'c1', predictedOutcome: OutcomeSide.YES },
      { conditionId: 'c2', predictedOutcome: OutcomeSide.YES },
    ];
    const conditions = makeConditionsMap([
      ['c1', { settled: true, nonDecisive: true }],
      ['c2', { settled: false }],
    ]);
    const result = computeResultFromConditions(picks, conditions);
    expect(result.result).toBe('COUNTERPARTY_WINS');
  });
});

// ---------------------------------------------------------------------------
// Tests — toPicks mixed resolver types
// ---------------------------------------------------------------------------

describe('toPicks — mixed resolver picks', () => {
  it('handles mixed Pyth + non-Pyth picks in same array', () => {
    const pythPick = makePickData({ predictedOutcome: 0 }); // Over
    const conditionPick: PickData = {
      id: 2,
      pickConfigId: '0x02',
      conditionResolver: '0x1234567890123456789012345678901234567890',
      conditionId: 'cond-rain',
      predictedOutcome: OutcomeSide.YES,
    };
    const map = makeConditionsMap([
      ['cond-rain', { question: 'Will it rain?' }],
    ]);

    const result = toPicks([pythPick, conditionPick], true, map);
    expect(result).toHaveLength(2);

    // First pick: Pyth
    expect(result[0].source).toBe('pyth');
    expect(result[0].choice).toBe('Yes');

    // Second pick: non-Pyth
    expect(result[1].source).toBeUndefined();
    expect(result[1].choice).toBe('Yes');
    expect(result[1].question).toBe('Will it rain?');
  });

  it('Pyth counterparty under (predictedOutcome=1) shows "Yes"', () => {
    const pick = makePickData({ predictedOutcome: 1 }); // Under on predictor side
    const result = toPicks([pick], false, emptyConditionsMap); // counterparty flips
    expect(result[0].choice).toBe('Yes');
  });

  it('uses shortName when question is null', () => {
    const pick: PickData = {
      id: 3,
      pickConfigId: '0x03',
      conditionResolver: '0x1234567890123456789012345678901234567890',
      conditionId: 'cond-short',
      predictedOutcome: OutcomeSide.YES,
    };
    const map = makeConditionsMap([
      ['cond-short', { question: null, shortName: 'Short question' }],
    ]);
    const result = toPicks([pick], true, map);
    expect(result[0].question).toBe('Short question');
  });

  it('passes through settled/resolvedToYes/nonDecisive from conditionsMap', () => {
    const conditionId = makePythConditionId();
    const pick = makePickData({ conditionId });
    const map = makeConditionsMap([
      [conditionId, { settled: true, resolvedToYes: true, nonDecisive: false }],
    ]);
    const result = toPicks([pick], true, map);
    expect(result[0].settled).toBe(true);
    expect(result[0].resolvedToYes).toBe(true);
    expect(result[0].nonDecisive).toBe(false);
  });
});
