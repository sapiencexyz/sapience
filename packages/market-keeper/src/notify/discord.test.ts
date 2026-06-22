import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { keeperEnv } from './discord';

describe('keeperEnv', () => {
  const KEYS = ['KEEPER_ENV', 'RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV'] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('prefers KEEPER_ENV over everything', () => {
    process.env.KEEPER_ENV = 'prod-keeper';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    process.env.NODE_ENV = 'production';
    expect(keeperEnv()).toBe('prod-keeper');
  });

  it('falls back to RAILWAY_ENVIRONMENT_NAME (distinguishes staging from prod)', () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
    process.env.NODE_ENV = 'production';
    expect(keeperEnv()).toBe('staging');
  });

  it('falls back to NODE_ENV off Railway', () => {
    process.env.NODE_ENV = 'test';
    expect(keeperEnv()).toBe('test');
  });

  it("defaults to 'development' when nothing is set", () => {
    expect(keeperEnv()).toBe('development');
  });
});
