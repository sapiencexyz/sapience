import { describe, it, expect } from 'vitest';
import { Condition } from './Condition';
import { ConditionOutcome } from '../__generated__/resolvers';

/**
 * `Condition.outcome` derives the public enum from the boolean state
 * columns (`settled`, `resolvedToYes`, `nonDecisive`). The behaviour
 * matters because clients filter "settled vs unsettled" via
 * `outcome: { isNull: ... }` — the boundary between null and non-null
 * is the resolver's responsibility.
 *
 * Codegen types every field resolver as the `Resolver<T>` union, which
 * isn't directly callable at the TS level. Cast through `unknown` to a
 * plain function shape — the same pattern `Condition.test.ts` uses for
 * `category`, `conditionGroup`, `attestations`, `predictions`.
 */
type OutcomeFn = (parent: unknown) => string | null;

describe('Condition.outcome — derivation from boolean state', () => {
  const outcomeFn = (Condition as unknown as { outcome: OutcomeFn }).outcome;
  const callOutcome = (parent: Record<string, unknown>) => outcomeFn(parent);

  it('returns null when unsettled', () => {
    expect(callOutcome({ id: 'c1', settled: false })).toBeNull();
  });

  it('returns null when `settled` is undefined', () => {
    expect(callOutcome({ id: 'c1' })).toBeNull();
  });

  it('returns YES when settled and resolvedToYes', () => {
    expect(
      callOutcome({
        id: 'c1',
        settled: true,
        resolvedToYes: true,
        nonDecisive: false,
      })
    ).toBe(ConditionOutcome.Yes);
  });

  it('returns NO when settled and not resolvedToYes', () => {
    expect(
      callOutcome({
        id: 'c1',
        settled: true,
        resolvedToYes: false,
        nonDecisive: false,
      })
    ).toBe(ConditionOutcome.No);
  });

  it('returns NON_DECISIVE when nonDecisive is true, regardless of resolvedToYes', () => {
    // The protocol treats voided settlements as collapsing to the
    // counterparty regardless of which side the YES/NO bit recorded.
    expect(
      callOutcome({
        id: 'c1',
        settled: true,
        resolvedToYes: true,
        nonDecisive: true,
      })
    ).toBe(ConditionOutcome.NonDecisive);

    expect(
      callOutcome({
        id: 'c1',
        settled: true,
        resolvedToYes: false,
        nonDecisive: true,
      })
    ).toBe(ConditionOutcome.NonDecisive);
  });
});
