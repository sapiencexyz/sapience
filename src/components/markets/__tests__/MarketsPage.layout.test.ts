import { describe, expect, it } from 'vitest';

import { getCardGridViewportStyle } from '../market-helpers';

describe('getCardGridViewportStyle', () => {
  it('uses minHeight instead of fixed height so mobile webviews cannot collapse the Polymarket grid', () => {
    expect(getCardGridViewportStyle(true)).toEqual({
      minHeight: 'calc(100dvh - var(--page-top-offset, 0px))',
    });
  });

  it('does not reserve viewport space for table view', () => {
    expect(getCardGridViewportStyle(false)).toBeUndefined();
  });
});
