import { describe, it, expect } from 'vitest';
import { classifyBalances } from './balances';
import type { BalanceReport, BalanceThresholds } from './types';

const thresholds: BalanceThresholds = {
  openrouterMinCredits: 10,
  adminMinPol: 5,
};

describe('classifyBalances', () => {
  it('flags OpenRouter low when remaining is below threshold', () => {
    const report: BalanceReport = {
      openrouter: { remaining: 1.62, totalCredits: 360, totalUsage: 358.38 },
      pol: { address: '0xabc', pol: 12 },
    };
    const cls = classifyBalances(report, thresholds);
    expect(cls.openrouterLow).toBe(true);
    expect(cls.polLow).toBe(false);
    expect(cls.anyLow).toBe(true);
  });

  it('flags POL low when balance is below threshold', () => {
    const report: BalanceReport = {
      openrouter: { remaining: 100, totalCredits: 200, totalUsage: 100 },
      pol: { address: '0xabc', pol: 0.4 },
    };
    const cls = classifyBalances(report, thresholds);
    expect(cls.openrouterLow).toBe(false);
    expect(cls.polLow).toBe(true);
    expect(cls.anyLow).toBe(true);
  });

  it('reports all-ok when both are above threshold', () => {
    const report: BalanceReport = {
      openrouter: { remaining: 50, totalCredits: 100, totalUsage: 50 },
      pol: { address: '0xabc', pol: 20 },
    };
    expect(classifyBalances(report, thresholds)).toEqual({
      openrouterLow: false,
      polLow: false,
      anyLow: false,
    });
  });

  it('treats a missing balance (fetch error) as not-low', () => {
    const report: BalanceReport = {
      openrouterError: 'HTTP 500',
      polError: 'rpc down',
    };
    expect(classifyBalances(report, thresholds)).toEqual({
      openrouterLow: false,
      polLow: false,
      anyLow: false,
    });
  });

  it('uses strict less-than at the threshold boundary', () => {
    const report: BalanceReport = {
      openrouter: { remaining: 10, totalCredits: 10, totalUsage: 0 },
      pol: { address: '0xabc', pol: 5 },
    };
    const cls = classifyBalances(report, thresholds);
    expect(cls.openrouterLow).toBe(false);
    expect(cls.polLow).toBe(false);
  });
});
