import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Clear all env vars that config reads so cleanEnv uses defaults
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.ENABLE_AUCTION_WS;
    delete process.env.SENTRY_DSN;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_MESSAGES;
    delete process.env.WS_IDLE_TIMEOUT_MS;
    delete process.env.WS_MAX_CONNECTIONS;
    delete process.env.WS_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe('Defaults', () => {
    it('uses default values when env vars are not set', async () => {
      const { config } = await import('../config');
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe('3002');
      expect(config.ENABLE_AUCTION_WS).toBe(true);
      expect(config.SENTRY_DSN).toBe('');
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(10_000);
      expect(config.RATE_LIMIT_MAX_MESSAGES).toBe(100);
      expect(config.WS_IDLE_TIMEOUT_MS).toBe(300_000);
      expect(config.WS_MAX_CONNECTIONS).toBe(1000);
      expect(config.WS_ALLOWED_ORIGINS).toBe('');
    });
  });

  describe('Overrides', () => {
    it('reads string values from process.env', async () => {
      process.env.PORT = '9999';
      process.env.SENTRY_DSN = 'https://sentry.example.com/123';
      process.env.WS_ALLOWED_ORIGINS =
        'http://localhost:3000,http://example.com';

      const { config } = await import('../config');
      expect(config.PORT).toBe('9999');
      expect(config.SENTRY_DSN).toBe('https://sentry.example.com/123');
      expect(config.WS_ALLOWED_ORIGINS).toBe(
        'http://localhost:3000,http://example.com'
      );
    });

    it('reads numeric values from process.env', async () => {
      process.env.RATE_LIMIT_WINDOW_MS = '5000';
      process.env.RATE_LIMIT_MAX_MESSAGES = '50';
      process.env.WS_IDLE_TIMEOUT_MS = '60000';
      process.env.WS_MAX_CONNECTIONS = '500';

      const { config } = await import('../config');
      expect(config.RATE_LIMIT_WINDOW_MS).toBe(5000);
      expect(config.RATE_LIMIT_MAX_MESSAGES).toBe(50);
      expect(config.WS_IDLE_TIMEOUT_MS).toBe(60000);
      expect(config.WS_MAX_CONNECTIONS).toBe(500);
    });

    it('reads boolean values from process.env', async () => {
      process.env.ENABLE_AUCTION_WS = 'false';

      const { config } = await import('../config');
      expect(config.ENABLE_AUCTION_WS).toBe(false);
    });

    it('reads NODE_ENV choices correctly', async () => {
      process.env.NODE_ENV = 'production';

      const { config } = await import('../config');
      expect(config.NODE_ENV).toBe('production');
    });
  });

  describe('Derived exports', () => {
    it('isProd is true when NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';

      const { isProd, isDev } = await import('../config');
      expect(isProd).toBe(true);
      expect(isDev).toBe(false);
    });

    it('isDev is true when NODE_ENV=development', async () => {
      // NODE_ENV defaults to development when not set
      const { isProd, isDev } = await import('../config');
      expect(isDev).toBe(true);
      expect(isProd).toBe(false);
    });

    it('both isProd and isDev are false when NODE_ENV=test', async () => {
      process.env.NODE_ENV = 'test';

      const { isProd, isDev } = await import('../config');
      expect(isProd).toBe(false);
      expect(isDev).toBe(false);
    });
  });
});
