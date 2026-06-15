import { describe, expect, test } from 'vitest';
import {
  POSITION_V2_FIELDS,
  toPositionBalance,
  type PositionV2Node,
} from './position';
import { PICK_CONFIGURATION_V2_FIELDS } from './pickConfig';

function makeNode(overrides: Partial<PositionV2Node> = {}): PositionV2Node {
  return {
    id: 'cG9zaXRpb246MQ==',
    chainId: 8453,
    holder: '0xholder',
    pickConfigId: '0xpickconfig',
    token: '0xtoken',
    side: 'PREDICTOR',
    status: 'OPEN',
    balance: '1000000000000000000',
    userCollateral: '500000000000000000',
    totalPayout: null,
    realizedPnl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    prediction: { predictionId: '0xprediction' },
    pickConfig: {
      pickConfigId: '0xpickconfig',
      chainId: 8453,
      escrow: '0xescrow',
      totalPredictorCollateral: '1',
      totalCounterpartyCollateral: '2',
      claimedPredictorCollateral: '0',
      claimedCounterpartyCollateral: '0',
      resolved: false,
      result: null,
      resolvedAt: null,
      predictorToken: '0xpred',
      counterpartyToken: '0xcounter',
      endsAt: 1760000000,
      isLegacy: false,
      picks: [
        {
          conditionId: '0xcond1',
          resolver: '0xresolver1',
          predictedOutcome: 'YES',
          condition: null,
        },
      ],
    },
    ...overrides,
  };
}

describe('toPositionBalance', () => {
  test('renames token → tokenAddress and passes through identity fields', () => {
    const bal = toPositionBalance(makeNode());
    expect(bal.id).toBe('cG9zaXRpb246MQ==');
    expect(bal.chainId).toBe(8453);
    expect(bal.holder).toBe('0xholder');
    expect(bal.tokenAddress).toBe('0xtoken');
    expect(bal.pickConfigId).toBe('0xpickconfig');
    expect(bal.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(bal.updatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  test('derives isPredictorToken from side', () => {
    expect(
      toPositionBalance(makeNode({ side: 'PREDICTOR' })).isPredictorToken
    ).toBe(true);
    expect(
      toPositionBalance(makeNode({ side: 'COUNTERPARTY' })).isPredictorToken
    ).toBe(false);
  });

  test('surfaces the explicit OPEN/SOLD status (v1 encoded it in the id)', () => {
    expect(toPositionBalance(makeNode({ status: 'OPEN' })).status).toBe('OPEN');
    expect(toPositionBalance(makeNode({ status: 'SOLD' })).status).toBe('SOLD');
  });

  test('renames realizedPnl → realizedPnL', () => {
    const bal = toPositionBalance(makeNode({ realizedPnl: '42' }));
    expect(bal.realizedPnL).toBe('42');
  });

  test('normalizes BigInt scalars (number | string) to decimal strings', () => {
    const bal = toPositionBalance(
      makeNode({ balance: 1000 as unknown as number, userCollateral: 500 })
    );
    expect(bal.balance).toBe('1000');
    expect(bal.userCollateral).toBe('500');
  });

  test('preserves nulls for optional wei fields', () => {
    const bal = toPositionBalance(
      makeNode({ userCollateral: null, totalPayout: null, realizedPnl: null })
    );
    expect(bal.userCollateral).toBeNull();
    expect(bal.totalPayout).toBeNull();
    expect(bal.realizedPnL).toBeNull();
  });

  test('delegates pickConfig mapping to toPickConfigData', () => {
    const bal = toPositionBalance(makeNode());
    expect(bal.pickConfig?.id).toBe('0xpickconfig');
    expect(bal.pickConfig?.marketAddress).toBe('0xescrow');
    // pick row id re-keyed to the stable `${pickConfigId}:${conditionId}` string
    expect(bal.pickConfig?.picks[0].id).toBe('0xpickconfig:0xcond1');
    expect(bal.pickConfig?.picks[0].conditionResolver).toBe('0xresolver1');
  });

  test('returns null pickConfig when absent', () => {
    const bal = toPositionBalance(makeNode({ pickConfig: null }));
    expect(bal.pickConfig).toBeNull();
  });

  test('backfills pickConfig.predictionId from the holder prediction (claim/permalink)', () => {
    const bal = toPositionBalance(makeNode());
    expect(bal.pickConfig?.predictionId).toBe('0xprediction');
  });

  test('predictionId is null when the position has no holder prediction', () => {
    const bal = toPositionBalance(makeNode({ prediction: null }));
    expect(bal.pickConfig?.predictionId).toBeNull();
  });
});

describe('POSITION_V2_FIELDS', () => {
  test('selects the v2 names the mapper reads', () => {
    for (const field of [
      'token',
      'side',
      'status',
      'pickConfigId',
      'balance',
      'userCollateral',
      'totalPayout',
      'realizedPnl',
    ]) {
      expect(POSITION_V2_FIELDS).toContain(field);
    }
  });

  test('embeds the shared pickConfig selection set', () => {
    expect(POSITION_V2_FIELDS).toContain(PICK_CONFIGURATION_V2_FIELDS.trim());
  });
});
