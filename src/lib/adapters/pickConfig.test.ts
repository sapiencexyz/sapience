import { describe, expect, test } from 'vitest';
import {
  PICK_CONFIGURATION_FIELDS,
  toPickConfigData,
  type PickConfigurationNode,
  type PickNode,
} from './pickConfig';

function makePick(overrides: Partial<PickNode> = {}): PickNode {
  return {
    conditionId: '0xcond1',
    resolver: '0xresolver1',
    predictedOutcome: 'YES',
    condition: {
      conditionId: '0xcond1',
      shortName: 'Short',
      optionName: null,
      question: 'Will it happen?',
      description: 'desc',
      endTime: 1760000000,
      resolver: '0xresolver1',
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      estimatedPrice: 0.42,
      category: { slug: 'crypto' },
    },
    ...overrides,
  };
}

function makeNode(
  overrides: Partial<PickConfigurationNode> = {}
): PickConfigurationNode {
  return {
    pickConfigId: '0xpc1',
    chainId: 8453,
    escrow: '0xescrow',
    totalPredictorCollateral: '1000000000000000000',
    totalCounterpartyCollateral: '3000000000000000000',
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: null,
    resolvedAt: null,
    predictorToken: '0xptoken',
    counterpartyToken: '0xctoken',
    endsAt: 1760000000,
    isLegacy: false,
    picks: [makePick()],
    ...overrides,
  };
}

describe('toPickConfigData', () => {
  test('maps pickConfigId to id and escrow to marketAddress', () => {
    const result = toPickConfigData(makeNode());
    expect(result.id).toBe('0xpc1');
    expect(result.marketAddress).toBe('0xescrow');
    expect(result.chainId).toBe(8453);
  });

  test('maps null result to UNRESOLVED', () => {
    const result = toPickConfigData(makeNode({ result: null }));
    expect(result.result).toBe('UNRESOLVED');
  });

  test('passes through terminal results unchanged', () => {
    expect(
      toPickConfigData(makeNode({ result: 'PREDICTOR_WINS', resolved: true }))
        .result
    ).toBe('PREDICTOR_WINS');
    expect(
      toPickConfigData(
        makeNode({ result: 'COUNTERPARTY_WINS', resolved: true })
      ).result
    ).toBe('COUNTERPARTY_WINS');
    expect(
      toPickConfigData(makeNode({ result: 'NON_DECISIVE', resolved: true }))
        .result
    ).toBe('NON_DECISIVE');
  });

  test('keeps GraphQL-native resolved and isLegacy flags', () => {
    const result = toPickConfigData(
      makeNode({ resolved: true, isLegacy: true })
    );
    expect(result.resolved).toBe(true);
    expect(result.isLegacy).toBe(true);
  });

  test('normalizes BigInt wire values to strings even when numbers arrive', () => {
    const result = toPickConfigData(
      makeNode({
        totalPredictorCollateral: 5 as unknown as string,
        totalCounterpartyCollateral: 7 as unknown as string,
        claimedPredictorCollateral: 0 as unknown as string,
        claimedCounterpartyCollateral: 1 as unknown as string,
      })
    );
    expect(result.totalPredictorCollateral).toBe('5');
    expect(result.totalCounterpartyCollateral).toBe('7');
    expect(result.claimedPredictorCollateral).toBe('0');
    expect(result.claimedCounterpartyCollateral).toBe('1');
  });

  test('passes through nullable fields', () => {
    const result = toPickConfigData(
      makeNode({
        resolvedAt: null,
        predictorToken: null,
        counterpartyToken: null,
        endsAt: null,
      })
    );
    expect(result.resolvedAt).toBeNull();
    expect(result.predictorToken).toBeNull();
    expect(result.counterpartyToken).toBeNull();
    expect(result.endsAt).toBeNull();
  });

  test('maps resolvedAt and tokens when present', () => {
    const result = toPickConfigData(
      makeNode({ resolvedAt: 1755000000, resolved: true })
    );
    expect(result.resolvedAt).toBe(1755000000);
    expect(result.predictorToken).toBe('0xptoken');
    expect(result.counterpartyToken).toBe('0xctoken');
  });

  test('returns empty picks when picks are missing', () => {
    const node = makeNode();
    delete (node as Partial<PickConfigurationNode>).picks;
    expect(toPickConfigData(node).picks).toEqual([]);
  });

  test('maps pick resolver to conditionResolver and YES/NO to 1/0', () => {
    const result = toPickConfigData(
      makeNode({
        picks: [
          makePick({ conditionId: '0xa', predictedOutcome: 'YES' }),
          makePick({ conditionId: '0xb', predictedOutcome: 'NO' }),
        ],
      })
    );
    expect(result.picks[0].conditionResolver).toBe('0xresolver1');
    expect(result.picks[0].predictedOutcome).toBe(1);
    expect(result.picks[1].predictedOutcome).toBe(0);
  });

  test('injects the parent pickConfigId and re-keys pick id to a stable string', () => {
    const result = toPickConfigData(makeNode());
    expect(result.picks[0].pickConfigId).toBe('0xpc1');
    expect(result.picks[0].id).toBe('0xpc1:0xcond1');
    expect(typeof result.picks[0].id).toBe('string');
  });

  test('carries the CTF hash as condition.id', () => {
    const result = toPickConfigData(makeNode());
    expect(result.picks[0].condition?.id).toBe('0xcond1');
  });

  test('maps null pick condition to null', () => {
    const result = toPickConfigData(
      makeNode({ picks: [makePick({ condition: null })] })
    );
    expect(result.picks[0].condition).toBeNull();
  });

  test('maps embedded condition fields onto PickConditionData', () => {
    const result = toPickConfigData(makeNode());
    expect(result.picks[0].condition).toEqual({
      id: '0xcond1',
      shortName: 'Short',
      optionName: null,
      question: 'Will it happen?',
      description: 'desc',
      endTime: 1760000000,
      resolver: '0xresolver1',
      category: { slug: 'crypto' },
      settled: false,
      resolvedToYes: false,
      nonDecisive: false,
      estimatedPrice: 0.42,
    });
  });

  test('drops unknown wire fields so consumers cannot key on row ids', () => {
    const node = makeNode();
    (node as Record<string, unknown>).id = 42;
    (node.picks[0] as Record<string, unknown>).id = 7;
    if (node.picks[0].condition) {
      (node.picks[0].condition as Record<string, unknown>).createdAt = 'x';
    }

    const result = toPickConfigData(node);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'chainId',
        'marketAddress',
        'totalPredictorCollateral',
        'totalCounterpartyCollateral',
        'claimedPredictorCollateral',
        'claimedCounterpartyCollateral',
        'resolved',
        'result',
        'resolvedAt',
        'predictorToken',
        'counterpartyToken',
        'endsAt',
        'isLegacy',
        'picks',
      ].sort()
    );
    expect(Object.keys(result.picks[0]).sort()).toEqual(
      [
        'id',
        'pickConfigId',
        'conditionResolver',
        'conditionId',
        'predictedOutcome',
        'condition',
      ].sort()
    );
    expect(result.id).toBe('0xpc1'); // not the numeric row id
    expect(result.picks[0].condition).not.toHaveProperty('createdAt');
  });

  test('does not invent predictionId (absent from the GraphQL node)', () => {
    const result = toPickConfigData(makeNode());
    expect('predictionId' in result).toBe(false);
  });
});

describe('PICK_CONFIGURATION_FIELDS', () => {
  test('selects the GraphQL field names, not the old aliases', () => {
    expect(PICK_CONFIGURATION_FIELDS).toContain('pickConfigId');
    expect(PICK_CONFIGURATION_FIELDS).toContain('escrow');
    expect(PICK_CONFIGURATION_FIELDS).toContain('isLegacy');
    expect(PICK_CONFIGURATION_FIELDS).toContain('predictedOutcome');
    expect(PICK_CONFIGURATION_FIELDS).not.toContain('marketAddress');
    expect(PICK_CONFIGURATION_FIELDS).not.toContain('conditionResolver');
  });

  test('selects no bare id field (the GraphQL schema has no numeric row ids)', () => {
    expect(PICK_CONFIGURATION_FIELDS).not.toMatch(/\bid\b/);
  });

  test('selects the embedded condition by CTF conditionId with convenience flags', () => {
    expect(PICK_CONFIGURATION_FIELDS).toContain('condition {');
    expect(PICK_CONFIGURATION_FIELDS).toContain('conditionId');
    expect(PICK_CONFIGURATION_FIELDS).toContain('settled');
    expect(PICK_CONFIGURATION_FIELDS).toContain('resolvedToYes');
    expect(PICK_CONFIGURATION_FIELDS).toContain('nonDecisive');
    expect(PICK_CONFIGURATION_FIELDS).toContain('estimatedPrice');
  });
});
