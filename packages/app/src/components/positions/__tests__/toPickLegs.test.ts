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
    predictedOutcome: 1, // over
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

  it('populates pythPrediction with decoded feed label, direction, targetPrice, priceExpo, dateTimeLocal', () => {
    const picks = toPicks([makePickData()], true, emptyConditionsMap);
    const pp = picks[0].pythPrediction;

    expect(pp).toBeDefined();
    expect(pp!.priceFeedLabel).toBe('ETH');
    expect(pp!.direction).toBe('over');
    expect(pp!.targetPrice).toBe(2500);
    expect(pp!.priceExpo).toBe(STRIKE_EXPO);
    expect(pp!.dateTimeLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('choice is "Over" or "Under" (not "Yes"/"No")', () => {
    // Predictor side, predicted over → "Over"
    const overPicks = toPicks(
      [makePickData({ predictedOutcome: 1 })],
      true,
      emptyConditionsMap
    );
    expect(overPicks[0].choice).toBe('Over');

    // Predictor side, predicted under → "Under"
    const underPicks = toPicks(
      [makePickData({ predictedOutcome: 0 })],
      true,
      emptyConditionsMap
    );
    expect(underPicks[0].choice).toBe('Under');

    // Counterparty side flips
    const counterOverPicks = toPicks(
      [makePickData({ predictedOutcome: 1 })],
      false,
      emptyConditionsMap
    );
    expect(counterOverPicks[0].choice).toBe('Under');
  });

  it('unknown feed still sets source: "pyth", priceFeedLabel is undefined', () => {
    const conditionId = makePythConditionId(UNKNOWN_PRICE_ID);
    const picks = toPicks(
      [makePickData({ conditionId })],
      true,
      emptyConditionsMap
    );

    expect(picks[0].source).toBe('pyth');
    expect(picks[0].pythPrediction).toBeDefined();
    expect(picks[0].pythPrediction!.priceFeedLabel).toBeUndefined();
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
    // No pythPrediction since decode failed
    expect(picks[0].pythPrediction).toBeUndefined();
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
