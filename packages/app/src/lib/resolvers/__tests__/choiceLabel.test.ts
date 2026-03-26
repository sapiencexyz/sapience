import { describe, it, expect } from 'vitest';
import { OutcomeSide } from '@sapience/sdk/types';
import { getChoiceLabel } from '../choiceLabel';

describe('getChoiceLabel', () => {
  it('returns "Yes" for OutcomeSide.YES', () => {
    expect(getChoiceLabel(OutcomeSide.YES)).toBe('Yes');
  });

  it('returns "No" for OutcomeSide.NO', () => {
    expect(getChoiceLabel(OutcomeSide.NO)).toBe('No');
  });

  it('treats numeric 0 as YES', () => {
    expect(getChoiceLabel(0)).toBe('Yes');
  });

  it('treats numeric 1 as NO', () => {
    expect(getChoiceLabel(1)).toBe('No');
  });
});
