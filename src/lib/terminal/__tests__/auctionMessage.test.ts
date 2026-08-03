import { describe, expect, it } from 'vitest';
import {
  asAuctionData,
  auctionMessageToUiTx,
  buildAuctionMessageAggregates,
  collectConditionIdsFromMessages,
  collectUniqueAddressesFromMessages,
  getAuctionId,
} from '~/lib/terminal/auctionMessage';

describe('asAuctionData', () => {
  it('returns the object verbatim when given an object', () => {
    const input = { predictor: '0xabc' };
    expect(asAuctionData(input)).toBe(input);
  });

  it('returns an empty object for non-objects', () => {
    expect(asAuctionData(null)).toEqual({});
    expect(asAuctionData(undefined)).toEqual({});
    expect(asAuctionData('string')).toEqual({});
    expect(asAuctionData(42)).toEqual({});
  });
});

describe('getAuctionId', () => {
  it('prefers channel over payload id', () => {
    expect(
      getAuctionId({
        channel: 'chan-1',
        data: { auctionId: 'data-1' },
      })
    ).toBe('chan-1');
  });

  it('falls back to data.auctionId', () => {
    expect(getAuctionId({ data: { auctionId: 'data-1' } })).toBe('data-1');
  });

  it('falls back to data.payload.auctionId', () => {
    expect(
      getAuctionId({
        data: { payload: { auctionId: 'payload-1' } },
      })
    ).toBe('payload-1');
  });

  it('falls back to the message-level auctionId', () => {
    expect(getAuctionId({ auctionId: 'msg-1' })).toBe('msg-1');
  });

  it('returns null when no id is present', () => {
    expect(getAuctionId({ data: {} })).toBeNull();
  });
});

describe('collectConditionIdsFromMessages', () => {
  it('returns an empty array for no matching messages', () => {
    expect(collectConditionIdsFromMessages([])).toEqual([]);
  });

  it('extracts conditionIds from escrow picks', () => {
    const result = collectConditionIdsFromMessages([
      {
        type: 'auction.started',
        data: {
          picks: [
            {
              conditionId: '0xabc',
              conditionResolver: '0xOtherResolver',
            },
            {
              conditionId: '0xdef',
              conditionResolver: '0xOtherResolver',
            },
          ],
        },
      },
    ]);
    expect(result).toContain('0xabc');
    expect(result).toContain('0xdef');
  });

  it('skips auction.bids messages', () => {
    expect(
      collectConditionIdsFromMessages([
        { type: 'auction.bids', data: { picks: [{ conditionId: '0xabc' }] } },
      ])
    ).toEqual([]);
  });

  it('dedupes conditionIds seen across messages', () => {
    const result = collectConditionIdsFromMessages([
      {
        type: 'auction.started',
        data: {
          picks: [{ conditionId: '0xsame', conditionResolver: '0xR' }],
        },
      },
      {
        type: 'auction.started',
        data: {
          picks: [{ conditionId: '0xsame', conditionResolver: '0xR' }],
        },
      },
    ]);
    expect(result).toEqual(['0xsame']);
  });
});

describe('collectUniqueAddressesFromMessages', () => {
  it('collects + sorts + dedupes predictor addresses', () => {
    const result = collectUniqueAddressesFromMessages([
      { type: 'auction.started', data: { predictor: '0xbbb' } },
      { type: 'auction.started', data: { predictor: '0xaaa' } },
      { type: 'auction.started', data: { predictor: '0xaaa' } },
      { type: 'auction.bids', data: { predictor: '0xccc' } },
    ]);
    expect(result).toEqual(['0xaaa', '0xbbb']);
  });

  it('ignores missing / non-string predictor fields', () => {
    const result = collectUniqueAddressesFromMessages([
      { type: 'auction.started', data: {} },
      { type: 'auction.started', data: { predictor: 123 as unknown } },
    ]);
    expect(result).toEqual([]);
  });
});

describe('buildAuctionMessageAggregates', () => {
  it('tracks the highest activity time per auction', () => {
    const { lastActivityByAuction } = buildAuctionMessageAggregates([
      { type: 'auction.started', channel: 'a', time: 100, data: {} },
      { type: 'auction.bids', channel: 'a', time: 500, data: {} },
      { type: 'auction.bids', channel: 'a', time: 300, data: {} },
    ]);
    expect(lastActivityByAuction.get('a')).toBe(500);
  });

  it('retains only the latest auction.started per auction', () => {
    const early = { type: 'auction.started', channel: 'b', time: 10, data: {} };
    const late = { type: 'auction.started', channel: 'b', time: 20, data: {} };
    const { latestStartedByAuction } = buildAuctionMessageAggregates([
      early,
      late,
    ]);
    expect(latestStartedByAuction.get('b')).toBe(late);
  });

  it('skips messages without an auction id', () => {
    const { lastActivityByAuction } = buildAuctionMessageAggregates([
      { type: 'auction.bids', data: {}, time: 1 },
    ]);
    expect(lastActivityByAuction.size).toBe(0);
  });
});

describe('auctionMessageToUiTx', () => {
  it('maps auction.started to the predictor perspective', () => {
    const tx = auctionMessageToUiTx({
      time: 1_700_000_000_000,
      type: 'auction.started',
      data: { predictor: '0xabc', predictorCollateral: '42' },
    });
    expect(tx.type).toBe('FORECAST');
    expect(tx.collateral).toBe('42');
    expect(tx.position?.owner).toBe('0xabc');
  });

  it('maps auction.bids to the top bid by counterpartyCollateral', () => {
    const tx = auctionMessageToUiTx({
      time: 1_700_000_000_001,
      type: 'auction.bids',
      data: {
        bids: [
          { counterparty: '0xlow', counterpartyCollateral: '10' },
          { counterparty: '0xhigh', counterpartyCollateral: '99' },
          { counterparty: '0xmid', counterpartyCollateral: '50' },
        ],
      },
    });
    expect(tx.collateral).toBe('99');
    expect(tx.position?.owner).toBe('0xhigh');
  });

  it('returns an empty-owner fallback for unrelated message types', () => {
    const tx = auctionMessageToUiTx({
      time: 0,
      type: 'auction.other',
      data: {},
    });
    expect(tx.collateral).toBe('0');
    expect(tx.position?.owner).toBe('');
  });
});
