import { describe, expect, it } from 'vitest';
import {
  describeBungeeStatus,
  isBungeeSuccess,
  isBungeeTerminal,
  recipientLabel,
} from '~/lib/bungee';

describe('bungee/status', () => {
  describe('isBungeeTerminal', () => {
    it.each([
      [0, false], // PENDING
      [1, false], // ASSIGNED
      [2, false], // EXTRACTED
      [3, true], // FULFILLED
      [4, true], // SETTLED
      [5, true], // EXPIRED
      [6, true], // CANCELLED
      [7, true], // REFUNDED
    ])('code %i → %s', (code, expected) => {
      expect(isBungeeTerminal(code)).toBe(expected);
    });

    it('treats undefined as non-terminal', () => {
      expect(isBungeeTerminal(undefined)).toBe(false);
    });
  });

  describe('isBungeeSuccess', () => {
    it.each([
      [0, false],
      [1, false],
      [2, false],
      [3, true], // FULFILLED
      [4, true], // SETTLED
      [5, false], // EXPIRED is terminal but not success
      [6, false], // CANCELLED
      [7, false], // REFUNDED
    ])('code %i → %s', (code, expected) => {
      expect(isBungeeSuccess(code)).toBe(expected);
    });

    it('treats undefined as not success', () => {
      expect(isBungeeSuccess(undefined)).toBe(false);
    });
  });

  describe('describeBungeeStatus', () => {
    it.each([
      [0, 'Pending'],
      [1, 'Assigned'],
      [2, 'In flight'],
      [3, 'Delivered'],
      [4, 'Settled'],
      [5, 'Expired'],
      [6, 'Cancelled'],
      [7, 'Refunded'],
    ])('code %i → %s', (code, expected) => {
      expect(describeBungeeStatus(code)).toBe(expected);
    });

    it('falls back to "Submitting" for unknown codes', () => {
      expect(describeBungeeStatus(undefined)).toBe('Submitting');
      expect(describeBungeeStatus(99)).toBe('Submitting');
    });
  });

  describe('recipientLabel', () => {
    it('matches the in-panel toggle copy', () => {
      expect(recipientLabel('smartAccount')).toBe('Sapience Account');
      expect(recipientLabel('eoa')).toBe('Wallet');
    });
  });
});
