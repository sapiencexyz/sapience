import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before the router import
// ---------------------------------------------------------------------------

const mockSendMarketRequestAlert = vi.fn();
const mockHasMarketRequestWebhook = vi.fn();

vi.mock('../services/marketRequestAlert', () => ({
  sendMarketRequestAlert: (...args: unknown[]) =>
    mockSendMarketRequestAlert(...args),
  hasMarketRequestWebhook: () => mockHasMarketRequestWebhook(),
  MAX_TICKER_LENGTH: 64,
  MAX_NOTE_LENGTH: 280,
}));

vi.mock('../core/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { router } from './marketRequests';

const app = express();
app.use(express.json());
app.use('/market-requests', router);

describe('POST /market-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasMarketRequestWebhook.mockReturnValue(true);
    mockSendMarketRequestAlert.mockReturnValue(true);
  });

  it('rejects a request without a ticker', async () => {
    const res = await request(app).post('/market-requests').send({});
    expect(res.status).toBe(400);
    expect(mockSendMarketRequestAlert).not.toHaveBeenCalled();
  });

  it('rejects an over-long ticker', async () => {
    const res = await request(app)
      .post('/market-requests')
      .send({ ticker: 'X'.repeat(65) });
    expect(res.status).toBe(400);
  });

  it('rejects a non-polymarket URL', async () => {
    const res = await request(app)
      .post('/market-requests')
      .send({ ticker: 'SUGAR', polymarketUrl: 'https://evil.example.com/x' });
    expect(res.status).toBe(400);
    expect(mockSendMarketRequestAlert).not.toHaveBeenCalled();
  });

  it('accepts a valid request and forwards it to the alert service', async () => {
    const res = await request(app).post('/market-requests').send({
      ticker: '  SUGAR  ',
      polymarketUrl: 'https://polymarket.com/event/sugar-price',
      walletAddress: '0x1111111111111111111111111111111111111111',
      note: 'please list this',
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ delivered: true });
    expect(mockSendMarketRequestAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'SUGAR',
        polymarketUrl: 'https://polymarket.com/event/sugar-price',
        walletAddress: '0x1111111111111111111111111111111111111111',
        note: 'please list this',
      })
    );
  });

  it('drops a bad wallet address but still accepts the request', async () => {
    const res = await request(app)
      .post('/market-requests')
      .send({ ticker: 'SUGAR', walletAddress: 'not-an-address' });

    expect(res.status).toBe(202);
    expect(mockSendMarketRequestAlert).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'SUGAR', walletAddress: null })
    );
  });

  it('returns 202 delivered:false when no webhook is configured', async () => {
    mockHasMarketRequestWebhook.mockReturnValue(false);
    const res = await request(app)
      .post('/market-requests')
      .send({ ticker: 'SUGAR' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ delivered: false });
    expect(mockSendMarketRequestAlert).not.toHaveBeenCalled();
  });
});
