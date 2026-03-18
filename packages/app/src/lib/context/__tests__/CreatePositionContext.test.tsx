import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { OutcomeSide } from '@sapience/sdk/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock localStorage
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
});

// Mock fetchConditionsByIds (used by the context for rehydration)
vi.mock('~/hooks/graphql/fetchConditionsByIds', () => ({
  fetchConditionsByIds: vi.fn().mockResolvedValue([]),
}));

// Re-export real SDK functions (no mocking — we want to test the real mapping)
vi.mock('@sapience/sdk/auction/escrowEncoding', async () => {
  const actual = await vi.importActual('@sapience/sdk/auction/escrowEncoding');
  return actual;
});

import {
  CreatePositionProvider,
  useCreatePositionContext,
} from '../CreatePositionContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <CreatePositionProvider>{children}</CreatePositionProvider>;
}

function makeSelection(overrides: Record<string, unknown> = {}) {
  return {
    conditionId: '0xCondition1',
    question: 'Will X happen?',
    prediction: true as boolean,
    resolverAddress: '0x1234567890123456789012345678901234567890',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreatePositionContext — predictedOutcome mapping', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('maps prediction: true → OutcomeSide.YES (0)', async () => {
    const { result } = renderHook(() => useCreatePositionContext(), {
      wrapper,
    });

    act(() => {
      result.current.addSelection(makeSelection({ prediction: true }));
    });

    const picks = result.current.getPolymarketPicks();
    expect(picks).toHaveLength(1);
    expect(picks[0].predictedOutcome).toBe(OutcomeSide.YES);
    expect(picks[0].predictedOutcome).toBe(0);
  });

  it('maps prediction: false → OutcomeSide.NO (1)', async () => {
    const { result } = renderHook(() => useCreatePositionContext(), {
      wrapper,
    });

    act(() => {
      result.current.addSelection(makeSelection({ prediction: false }));
    });

    const picks = result.current.getPolymarketPicks();
    expect(picks).toHaveLength(1);
    expect(picks[0].predictedOutcome).toBe(OutcomeSide.NO);
    expect(picks[0].predictedOutcome).toBe(1);
  });

  it('multi-pick: YES and NO selections produce correct outcome values', async () => {
    const { result } = renderHook(() => useCreatePositionContext(), {
      wrapper,
    });

    act(() => {
      result.current.addSelection(
        makeSelection({
          conditionId: '0xA',
          prediction: true,
          resolverAddress: '0x1111111111111111111111111111111111111111',
        })
      );
      result.current.addSelection(
        makeSelection({
          conditionId: '0xB',
          prediction: false,
          resolverAddress: '0x2222222222222222222222222222222222222222',
        })
      );
    });

    const picks = result.current.getPolymarketPicks();
    expect(picks).toHaveLength(2);

    const pickA = picks.find(
      (p) => p.conditionId.toLowerCase() === '0xa'.toLowerCase()
    );
    const pickB = picks.find(
      (p) => p.conditionId.toLowerCase() === '0xb'.toLowerCase()
    );

    expect(pickA).toBeDefined();
    expect(pickB).toBeDefined();
    expect(pickA!.predictedOutcome).toBe(0); // YES
    expect(pickB!.predictedOutcome).toBe(1); // NO
  });

  it('excludes selections without resolverAddress', async () => {
    const { result } = renderHook(() => useCreatePositionContext(), {
      wrapper,
    });

    act(() => {
      result.current.addSelection(
        makeSelection({ resolverAddress: null, prediction: true })
      );
    });

    const picks = result.current.getPolymarketPicks();
    expect(picks).toHaveLength(0);
  });

  it('toggling prediction on same conditionId updates the outcome', async () => {
    const { result } = renderHook(() => useCreatePositionContext(), {
      wrapper,
    });

    act(() => {
      result.current.addSelection(
        makeSelection({ conditionId: '0xA', prediction: true })
      );
    });

    expect(result.current.getPolymarketPicks()[0].predictedOutcome).toBe(0); // YES

    act(() => {
      result.current.addSelection(
        makeSelection({ conditionId: '0xA', prediction: false })
      );
    });

    const picks = result.current.getPolymarketPicks();
    expect(picks).toHaveLength(1);
    expect(picks[0].predictedOutcome).toBe(1); // NO
  });
});
