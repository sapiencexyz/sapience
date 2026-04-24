import { describe, expect, it } from 'vitest';
import {
  validateConditionCsvRow,
  type ConditionCsvRow,
} from '~/lib/admin/conditionCsv';

const FUTURE_TIMESTAMP = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
const VALID_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

function base(overrides: Partial<ConditionCsvRow> = {}): ConditionCsvRow {
  return {
    question: 'Will X happen?',
    endTimeUTC: String(FUTURE_TIMESTAMP),
    description: 'Some description',
    resolver: VALID_ADDRESS,
    ...overrides,
  };
}

describe('validateConditionCsvRow', () => {
  it('accepts a minimal valid row', () => {
    const result = validateConditionCsvRow(base(), 1);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.parsedEndTime).toBe(FUTURE_TIMESTAMP);
    expect(result.parsedPublic).toBe(true);
    expect(result.parsedResolver).toBe(VALID_ADDRESS.toLowerCase());
  });

  it('flags a missing question', () => {
    const result = validateConditionCsvRow(base({ question: '' }), 1);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Question is required');
  });

  it('flags a non-hex resolver', () => {
    const result = validateConditionCsvRow(
      base({ resolver: 'not-an-addr' }),
      1
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(
      'Resolver must be a valid Ethereum address (0x...)'
    );
  });

  it('rejects a past end time', () => {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 60;
    const result = validateConditionCsvRow(
      base({ endTimeUTC: String(pastTimestamp) }),
      1
    );
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('End time must be in the future');
  });

  it('rejects a non-numeric end time', () => {
    const result = validateConditionCsvRow(base({ endTimeUTC: 'soon' }), 1);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('End time must be a valid Unix timestamp');
  });

  it('parses the `public` flag case-insensitively', () => {
    const trueResult = validateConditionCsvRow(base({ public: 'TRUE' }), 1);
    expect(trueResult.parsedPublic).toBe(true);
    const falseResult = validateConditionCsvRow(base({ public: 'False' }), 1);
    expect(falseResult.parsedPublic).toBe(false);
  });

  it('defaults public to true when unset', () => {
    const result = validateConditionCsvRow(base({ public: '' }), 1);
    expect(result.parsedPublic).toBe(true);
  });

  it('rejects non-boolean public values', () => {
    const result = validateConditionCsvRow(base({ public: 'maybe' }), 1);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Public must be "true" or "false"');
  });

  it('splits and trims similarMarkets URLs', () => {
    const result = validateConditionCsvRow(
      base({ similarMarkets: 'https://a.test, https://b.test ,' }),
      1
    );
    expect(result.parsedSimilarMarkets).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('lowercases a checksummed resolver address', () => {
    // EIP-55 checksummed form of VALID_ADDRESS
    const checksummed = '0x1234567890AbcdEF1234567890aBcdef12345678';
    const result = validateConditionCsvRow(base({ resolver: checksummed }), 1);
    expect(result.parsedResolver).toBe(checksummed.toLowerCase());
  });

  it('accumulates multiple field errors', () => {
    const result = validateConditionCsvRow(
      {
        question: '',
        endTimeUTC: '',
        description: '',
        resolver: '',
      },
      42
    );
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.rowIndex).toBe(42);
  });
});
