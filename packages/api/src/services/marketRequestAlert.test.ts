import { describe, it, expect } from 'vitest';
import {
  buildMarketRequestEmbed,
  sendMarketRequestAlert,
  hasMarketRequestWebhook,
} from './marketRequestAlert';

describe('marketRequestAlert', () => {
  describe('buildMarketRequestEmbed', () => {
    it('puts the ticker in the description', () => {
      const embed = buildMarketRequestEmbed({ ticker: 'SUGAR' }) as {
        description: string;
        fields: unknown[];
      };
      expect(embed.description).toContain('SUGAR');
      expect(embed.fields).toEqual([]);
    });

    it('includes optional polymarket link, note and wallet as fields', () => {
      const embed = buildMarketRequestEmbed({
        ticker: 'SUGAR',
        polymarketUrl: 'https://polymarket.com/event/sugar',
        note: 'pls',
        walletAddress: '0xabc',
      }) as { fields: Array<{ name: string; value: string }> };

      const values = embed.fields.map((f) => f.value);
      expect(values).toContain('https://polymarket.com/event/sugar');
      expect(values).toContain('pls');
      expect(values.some((v) => v.includes('0xabc'))).toBe(true);
    });
  });

  describe('sendMarketRequestAlert', () => {
    it('returns false when no webhook is configured (test env)', () => {
      // No DISCORD_* env vars set in the test environment.
      expect(hasMarketRequestWebhook()).toBe(false);
      expect(sendMarketRequestAlert({ ticker: 'SUGAR' })).toBe(false);
    });
  });
});
