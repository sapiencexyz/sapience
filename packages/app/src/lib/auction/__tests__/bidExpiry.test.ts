import { describe, expect, it } from 'vitest';
import {
  DEADLINE_DISPLAY_BUFFER_SECS,
  effectiveDeadlineMs,
  effectiveDeadlineSecs,
  isBidExpired,
  remainingMsToDeadline,
} from '~/lib/auction/bidExpiry';

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);

describe('bidExpiry', () => {
  it('exposes a 1-second display buffer', () => {
    expect(DEADLINE_DISPLAY_BUFFER_SECS).toBe(1);
  });

  describe('effectiveDeadlineSecs / effectiveDeadlineMs', () => {
    it('subtracts the buffer in seconds and milliseconds', () => {
      const deadline = NOW_SEC + 30;
      expect(effectiveDeadlineSecs(deadline)).toBe(NOW_SEC + 29);
      expect(effectiveDeadlineMs(deadline)).toBe((NOW_SEC + 29) * 1000);
    });
  });

  describe('isBidExpired', () => {
    it('treats a bid as expired one second before its on-chain deadline', () => {
      const deadlineSec = NOW_SEC + 1;
      expect(isBidExpired(deadlineSec, NOW_MS)).toBe(true);
    });

    it('treats a bid with >1s remaining as live', () => {
      const deadlineSec = NOW_SEC + 2;
      expect(isBidExpired(deadlineSec, NOW_MS)).toBe(false);
    });

    it('treats an on-chain-expired bid as expired', () => {
      const deadlineSec = NOW_SEC - 5;
      expect(isBidExpired(deadlineSec, NOW_MS)).toBe(true);
    });
  });

  describe('remainingMsToDeadline', () => {
    it('returns the buffered remaining time in ms', () => {
      const deadlineSec = NOW_SEC + 30;
      expect(remainingMsToDeadline(deadlineSec, NOW_MS)).toBe(29_000);
    });

    it('clamps to zero when the buffered deadline has passed', () => {
      const deadlineSec = NOW_SEC;
      expect(remainingMsToDeadline(deadlineSec, NOW_MS)).toBe(0);
    });

    it('clamps to zero exactly at the buffered deadline', () => {
      const deadlineSec = NOW_SEC + 1;
      expect(remainingMsToDeadline(deadlineSec, NOW_MS)).toBe(0);
    });
  });
});
