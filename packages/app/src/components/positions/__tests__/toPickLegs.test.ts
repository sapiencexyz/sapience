import { describe, it, expect } from 'vitest';
import { OutcomeSide } from '@sapience/sdk/types';
import {
  toPicks,
  computeResultFromConditions,
  type ConditionsMap,
} from '../toPickLegs';

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
