import { describe, it, expect } from 'vitest';
import {
  questionMentionsImminentDate,
  computeDesiredTags,
  TODAY_TAG,
} from './match';

// All dates are interpreted in UTC. Fix `now` for determinism.
const NOW = new Date('2026-05-18T12:00:00Z'); // today = 2026-05-18 UTC
// today  → 2026-05-18
// tomorrow → 2026-05-19

describe('questionMentionsImminentDate', () => {
  describe('literal "today" / "tomorrow"', () => {
    it('matches the word "today" (lowercase)', () => {
      expect(questionMentionsImminentDate('Will it rain today?', NOW)).toBe(
        true
      );
    });

    it('matches "Today" (capitalized)', () => {
      expect(questionMentionsImminentDate('Will Trump speak Today?', NOW)).toBe(
        true
      );
    });

    it('matches the word "tomorrow"', () => {
      expect(
        questionMentionsImminentDate('Will Bitcoin pump tomorrow?', NOW)
      ).toBe(true);
    });

    it('does not match "yesterday"', () => {
      expect(questionMentionsImminentDate('Did it rain yesterday?', NOW)).toBe(
        false
      );
    });

    it('does not match "today" as substring of another word', () => {
      // word boundary
      expect(
        questionMentionsImminentDate('Will the antodayote work?', NOW)
      ).toBe(false);
    });
  });

  describe('month-name + day form', () => {
    it('matches "May 18" when today is May 18', () => {
      expect(
        questionMentionsImminentDate('Will SpaceX launch on May 18?', NOW)
      ).toBe(true);
    });

    it('matches "May 19" when tomorrow is May 19', () => {
      expect(
        questionMentionsImminentDate('Will Trump speak by May 19?', NOW)
      ).toBe(true);
    });

    it('does not match "May 20" (day after tomorrow)', () => {
      expect(
        questionMentionsImminentDate('Will X happen on May 20?', NOW)
      ).toBe(false);
    });

    it('does not match "May 17" (yesterday)', () => {
      expect(
        questionMentionsImminentDate('Will X have happened by May 17?', NOW)
      ).toBe(false);
    });

    it('matches "18 May" (reversed form)', () => {
      expect(
        questionMentionsImminentDate('Will X by 18 May happen?', NOW)
      ).toBe(true);
    });

    it('matches "May 18, 2026" with year', () => {
      expect(
        questionMentionsImminentDate('Will X resolve by May 18, 2026?', NOW)
      ).toBe(true);
    });

    it('matches "May 18 2026" with year no comma', () => {
      expect(
        questionMentionsImminentDate('Will X happen May 18 2026?', NOW)
      ).toBe(true);
    });

    it('matches case-insensitive month names', () => {
      expect(
        questionMentionsImminentDate('Will it happen on MAY 18?', NOW)
      ).toBe(true);
      expect(
        questionMentionsImminentDate('Will it happen on may 19?', NOW)
      ).toBe(true);
    });

    it('matches full month name "May"', () => {
      // (already covered above — "May" is the only month with the same
      // short + long form. Verify a different month would still work
      // with a different `now`.)
      const julyNow = new Date('2026-07-15T12:00:00Z');
      expect(questionMentionsImminentDate('Will X on July 15?', julyNow)).toBe(
        true
      );
    });

    it('rejects "May 1800s" (word boundary protects against substring)', () => {
      // The day 18 is today but the title actually says "1800s" not "18".
      // \d{1,2}(?!\d) lookahead should reject 18 when followed by more digits.
      expect(
        questionMentionsImminentDate(
          'Will May 1800s history repeat itself?',
          NOW
        )
      ).toBe(false);
    });
  });

  describe('ISO date (YYYY-MM-DD)', () => {
    it('matches "2026-05-18" (today)', () => {
      expect(
        questionMentionsImminentDate('Will X resolve 2026-05-18?', NOW)
      ).toBe(true);
    });

    it('matches "2026-05-19" (tomorrow)', () => {
      expect(
        questionMentionsImminentDate('Will X resolve 2026-05-19?', NOW)
      ).toBe(true);
    });

    it('does not match "2026-05-20" (day after tomorrow)', () => {
      expect(
        questionMentionsImminentDate('Will X resolve 2026-05-20?', NOW)
      ).toBe(false);
    });

    it('does not match "2026-05-17" (yesterday)', () => {
      expect(
        questionMentionsImminentDate('Will X resolve 2026-05-17?', NOW)
      ).toBe(false);
    });
  });

  describe('excluded forms (intentional false negatives)', () => {
    it('does NOT match slash form "5/18"', () => {
      // Slash forms produce too many false positives on score-like text
      // (e.g. "Result: 5-18"); excluded per plan.
      expect(
        questionMentionsImminentDate('Score was 5/18 in the final', NOW)
      ).toBe(false);
    });

    it('does NOT match dash form "5-18"', () => {
      expect(questionMentionsImminentDate('Final score 5-18', NOW)).toBe(false);
    });
  });

  describe('empty / edge cases', () => {
    it('returns false for empty question', () => {
      expect(questionMentionsImminentDate('', NOW)).toBe(false);
    });
  });
});

describe('computeDesiredTags', () => {
  it('adds the today tag when matched and not already present', () => {
    expect(computeDesiredTags(['Politics'], true)).toEqual([
      'Politics',
      TODAY_TAG,
    ]);
  });

  it('removes the today tag when not matched and currently present', () => {
    expect(computeDesiredTags(['Politics', TODAY_TAG], false)).toEqual([
      'Politics',
    ]);
  });

  it('keeps the today tag when matched and already present (idempotent)', () => {
    expect(computeDesiredTags(['Politics', TODAY_TAG], true)).toEqual([
      'Politics',
      TODAY_TAG,
    ]);
  });

  it('keeps tag set unchanged when not matched and not present', () => {
    expect(computeDesiredTags(['Politics'], false)).toEqual(['Politics']);
  });

  it('handles empty tag set', () => {
    expect(computeDesiredTags([], true)).toEqual([TODAY_TAG]);
    expect(computeDesiredTags([], false)).toEqual([]);
  });
});
