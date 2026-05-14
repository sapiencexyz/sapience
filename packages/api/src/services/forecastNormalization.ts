import { OutcomeSide } from '@sapience/sdk/types';

export type NormalizedProbability = {
  probabilityFloat: number | null;
  probabilityD18: string | null;
};

/**
 * Normalize a raw on-chain forecast value into a probability.
 *
 * The on-chain EAS schema declares the field as `uint256 forecast`, so the
 * indexer always writes a decimal-digits string representing D18 fixed-point
 * in `[0, 1e18]`. We clamp to that range and return both the float and the
 * D18 string forms.
 */
export function normalizeForecastToProbability(
  rawForecast: string
): NormalizedProbability {
  if (!rawForecast) return { probabilityFloat: null, probabilityD18: null };

  const trimmed = String(rawForecast).trim();
  if (!/^\d+$/.test(trimmed))
    return { probabilityFloat: null, probabilityD18: null };

  try {
    const oneD18 = 10n ** 18n;
    const n = BigInt(trimmed);
    const clamped = n > oneD18 ? oneD18 : n;
    const p = Number(clamped) / 1e18;
    if (!Number.isFinite(p))
      return { probabilityFloat: null, probabilityD18: null };
    return { probabilityFloat: p, probabilityD18: clamped.toString() };
  } catch {
    return { probabilityFloat: null, probabilityD18: null };
  }
}

export function outcomeFromCondition(condition: {
  settled: boolean;
  resolvedToYes: boolean;
}): OutcomeSide | null {
  if (!condition.settled) {
    return null;
  }
  return condition.resolvedToYes ? OutcomeSide.YES : OutcomeSide.NO;
}
