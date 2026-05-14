/**
 * Pins the structured log line shape — `event` and message text are the
 * surface aggregator queries grep on. Renaming either silently breaks
 * cleanup-readiness telemetry; this test fails before that happens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInfo = vi.hoisted(() => vi.fn());

vi.mock('../core/logger', () => ({
  createLogger: () => ({
    info: mockInfo,
  }),
}));

import { logDeprecatedHit } from './deprecationTelemetry';

beforeEach(() => {
  mockInfo.mockReset();
});

describe('logDeprecatedHit', () => {
  it('emits one info log per call with the canonical event + message', () => {
    logDeprecatedHit('predictionCount');
    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockInfo).toHaveBeenCalledWith(
      { event: 'deprecated_resolver', name: 'predictionCount' },
      'deprecated GraphQL resolver hit'
    );
  });

  it('passes the resolver name through verbatim', () => {
    logDeprecatedHit('attestations');
    logDeprecatedHit('categories');
    logDeprecatedHit('users');
    const names = mockInfo.mock.calls.map(
      (c) => (c[0] as { name: string }).name
    );
    expect(names).toEqual(['attestations', 'categories', 'users']);
  });

  it('emits one line per call, never coalesces (counts must add)', () => {
    for (let i = 0; i < 5; i += 1) logDeprecatedHit('positions');
    expect(mockInfo).toHaveBeenCalledTimes(5);
  });
});
