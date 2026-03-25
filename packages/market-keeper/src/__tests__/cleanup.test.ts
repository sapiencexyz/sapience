import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before importing main
vi.mock('../utils', () => ({
  validatePrivateKey: vi.fn(() => '0x' + 'a'.repeat(64)),
  confirmProductionAccess: vi.fn(),
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../cleanup/api', () => ({
  fetchExpiredNoEngagementConditions: vi.fn(),
  privateConditions: vi.fn(),
  republishConditions: vi.fn(),
  fetchConditionsWithEngagement: vi.fn(),
  settleConditionOnPolygon: vi.fn(),
}));

vi.mock('../polygon/client', () => ({
  createPolygonClient: vi.fn(() => ({})),
  createPolygonWalletClient: vi.fn(() => ({})),
  canRequestResolution: vi.fn(),
}));

import { main } from '../cleanup/index';
import {
  fetchExpiredNoEngagementConditions,
  privateConditions,
  republishConditions,
  fetchConditionsWithEngagement,
  settleConditionOnPolygon,
} from '../cleanup/api';
import { canRequestResolution } from '../polygon/client';
import { log } from '../utils';

const mockFetchExpired = vi.mocked(fetchExpiredNoEngagementConditions);
const mockPrivate = vi.mocked(privateConditions);
const mockFetchByIds = vi.mocked(fetchConditionsWithEngagement);
const mockRepublish = vi.mocked(republishConditions);
const mockSettle = vi.mocked(settleConditionOnPolygon);
const mockCanRequestResolution = vi.mocked(canRequestResolution);
const mockLog = vi.mocked(log);

interface TestCondition {
  id: string;
  openInterest: string;
  attestationCount: number;
}

function makeCondition(overrides: Partial<TestCondition> = {}): TestCondition {
  return {
    id: '0x' + 'a'.repeat(64),
    openInterest: '0',
    attestationCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  process.env.SAPIENCE_API_URL = 'https://test-api.example.com';
  process.env.ADMIN_PRIVATE_KEY = 'a'.repeat(64);
  process.env.POLYGON_RPC_URL = 'https://polygon-rpc.example.com';
  process.argv = ['node', 'cleanup-polymarket.ts', '--dry-run'];
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Run main() while advancing fake timers to resolve the safeguard delay.
 */
async function runMainWithTimers(): Promise<void> {
  const promise = main();
  // Advance past the 15s safeguard wait
  await vi.advanceTimersByTimeAsync(20_000);
  await promise;
}

describe('cleanup-polymarket main()', () => {
  it('exits early when no expired unresolved conditions found', async () => {
    mockFetchExpired.mockResolvedValue([]);

    await runMainWithTimers();

    expect(mockCanRequestResolution).not.toHaveBeenCalled();
    expect(mockPrivate).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining('No expired unresolved conditions')
    );
  });

  it('privates resolved conditions with OI=0 and no attestations', async () => {
    const condition = makeCondition({
      id: '0x1',
      openInterest: '0',
      attestationCount: 0,
    });
    mockFetchExpired.mockResolvedValue([condition]);
    mockCanRequestResolution.mockResolvedValue(true);
    mockPrivate.mockResolvedValue({ success: true, updated: 1 });
    mockFetchByIds.mockResolvedValue([]);
    process.argv = ['node', 'cleanup-polymarket.ts', '--execute'];

    await runMainWithTimers();

    expect(mockPrivate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ['0x1']
    );
  });

  it('skips unresolved conditions (not yet resolved on Polygon CTF)', async () => {
    const condition = makeCondition({ id: '0x1' });
    mockFetchExpired.mockResolvedValue([condition]);
    mockCanRequestResolution.mockResolvedValue(false);
    process.argv = ['node', 'cleanup-polymarket.ts', '--execute'];

    await runMainWithTimers();

    expect(mockPrivate).not.toHaveBeenCalled();
    const logCalls = mockLog.mock.calls.map((c) => String(c[0]));
    expect(logCalls.some((msg) => msg.includes('Not resolved'))).toBe(true);
  });

  it('re-publishes and settles if a privated condition gains OI during safeguard wait', async () => {
    const condition = makeCondition({
      id: '0x1',
      openInterest: '0',
      attestationCount: 0,
    });
    mockFetchExpired.mockResolvedValue([condition]);
    mockCanRequestResolution.mockResolvedValue(true);
    mockPrivate.mockResolvedValue({ success: true, updated: 1 });
    mockRepublish.mockResolvedValue({ success: true, updated: 1 });
    // After 15s wait, OI has appeared
    mockFetchByIds.mockResolvedValue(['0x1']);
    mockSettle.mockResolvedValue({ success: true });
    process.argv = ['node', 'cleanup-polymarket.ts', '--execute'];

    await runMainWithTimers();

    expect(mockPrivate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ['0x1']
    );
    // Re-publish before settling
    expect(mockRepublish).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ['0x1']
    );
    expect(mockSettle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '0x1'
    );
  });

  it('re-publishes and settles if a privated condition gains attestations during safeguard wait', async () => {
    const condition = makeCondition({
      id: '0x1',
      openInterest: '0',
      attestationCount: 0,
    });
    mockFetchExpired.mockResolvedValue([condition]);
    mockCanRequestResolution.mockResolvedValue(true);
    mockPrivate.mockResolvedValue({ success: true, updated: 1 });
    mockRepublish.mockResolvedValue({ success: true, updated: 1 });
    // After 15s wait, attestations appeared
    mockFetchByIds.mockResolvedValue(['0x1']);
    mockSettle.mockResolvedValue({ success: true });
    process.argv = ['node', 'cleanup-polymarket.ts', '--execute'];

    await runMainWithTimers();

    expect(mockPrivate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ['0x1']
    );
    // Re-publish before settling
    expect(mockRepublish).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      ['0x1']
    );
    expect(mockSettle).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      '0x1'
    );
  });

  it('does not private or settle in dry-run mode', async () => {
    const condition = makeCondition({ id: '0x1' });
    mockFetchExpired.mockResolvedValue([condition]);
    mockCanRequestResolution.mockResolvedValue(true);

    await runMainWithTimers();

    expect(mockPrivate).not.toHaveBeenCalled();
    expect(mockSettle).not.toHaveBeenCalled();
  });
});
