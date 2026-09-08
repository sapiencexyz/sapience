import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSessionState } from './useSessionState';

describe('useSessionState', () => {
  it('migrates invalid persisted values back to a valid default', async () => {
    window.sessionStorage.setItem(
      'sapience.markets.sortField',
      JSON.stringify('volume')
    );

    const { result } = renderHook(() =>
      useSessionState('sapience.markets.sortField', 'openInterest', {
        migrate: (value) =>
          value === 'openInterest' ||
          value === 'endTime' ||
          value === 'createdAt' ||
          value === 'predictionCount' ||
          value === 'similarMarketVolume'
            ? value
            : 'openInterest',
      })
    );

    expect(result.current[0]).toBe('openInterest');

    await waitFor(() => {
      expect(window.sessionStorage.getItem('sapience.markets.sortField')).toBe(
        JSON.stringify('openInterest')
      );
    });
  });
});
