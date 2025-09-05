import { sqrtPriceX96ToSettlementPriceD18 } from '../utils/utils';
import type { Market } from '../../generated/prisma';

export type NormalizedProbability = {
  probabilityFloat: number | null;
  probabilityD18: string | null;
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return value;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizePredictionToProbability(
  rawPrediction: string,
  market: Pick<Market, 'minPriceD18' | 'maxPriceD18'> | null
): NormalizedProbability {
  if (!rawPrediction) return { probabilityFloat: null, probabilityD18: null };

  const trimmed = String(rawPrediction).trim();

  // yes/no strings
  const lower = trimmed.toLowerCase();
  if (lower === 'yes' || lower === 'true') {
    return { probabilityFloat: 1, probabilityD18: '1000000000000000000' };
  }
  if (lower === 'no' || lower === 'false') {
    return { probabilityFloat: 0, probabilityD18: '0' };
  }

  // explicit 0/1
  if (trimmed === '1')
    return { probabilityFloat: 1, probabilityD18: '1000000000000000000' };
  if (trimmed === '0') return { probabilityFloat: 0, probabilityD18: '0' };

  // decimal between 0 and 1
  if (/^0?(\.\d+)?$|^1(\.0+)?$/.test(trimmed)) {
    const p = clamp01(parseFloat(trimmed));
    if (!Number.isFinite(p))
      return { probabilityFloat: null, probabilityD18: null };
    const d18 = BigInt(Math.round(p * 1e18)).toString();
    return { probabilityFloat: p, probabilityD18: d18 };
  }

  // Numeric-only string: decide between sqrtPriceX96 vs D18 based on context/value
  if (/^\d+$/.test(trimmed)) {
    // If market context is available, try sqrtPriceX96 FIRST so large integers (uint160) don't get misclassified as D18
    if (market && market.minPriceD18 != null && market.maxPriceD18 != null) {
      try {
        const sqrt = BigInt(trimmed);
        const priceD18 = sqrtPriceX96ToSettlementPriceD18(sqrt);
        const min = BigInt(market.minPriceD18.toString());
        const max = BigInt(market.maxPriceD18.toString());
        if (max !== min) {
          // Clamp first in BigInt space to avoid Number overflow
          if (priceD18 <= min) {
            return { probabilityFloat: 0, probabilityD18: '0' };
          }
          if (priceD18 >= max) {
            return {
              probabilityFloat: 1,
              probabilityD18: '1000000000000000000',
            };
          }
          const num = Number(priceD18 - min);
          const den = Number(max - min);
          if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
            const p = clamp01(num / den);
            const d18 = BigInt(Math.round(p * 1e18)).toString();
            return { probabilityFloat: p, probabilityD18: d18 };
          }
        }
        // If computation failed, fall through to D18 attempt
      } catch {
        // fallthrough to D18 attempt
      }
    }

    // Treat as D18 integer only if value <= 1e18 (i.e., within [0, 1] in 18 decimals)
    try {
      const n = BigInt(trimmed);
      const oneD18 = 10n ** 18n;
      if (n <= oneD18) {
        const p = Number(n) / 1e18;
        if (Number.isFinite(p)) {
          return { probabilityFloat: clamp01(p), probabilityD18: n.toString() };
        }
      }
    } catch {
      // ignore
    }
  }

  return { probabilityFloat: null, probabilityD18: null };
}

export function outcomeFromSettlement(
  market: Pick<
    Market,
    'settled' | 'settlementPriceD18' | 'minPriceD18' | 'maxPriceD18'
  >
): 0 | 1 | null {
  if (
    !market.settled ||
    market.settlementPriceD18 == null ||
    market.minPriceD18 == null ||
    market.maxPriceD18 == null
  ) {
    return null;
  }
  const setD18 = BigInt(market.settlementPriceD18.toString());
  const min = BigInt(market.minPriceD18.toString());
  const max = BigInt(market.maxPriceD18.toString());
  if (max <= min) return null;
  // Map settlement to [0,1] and round to nearest bound (0 = No, 1 = Yes)
  const range = max - min;
  const ratioNum = setD18 - min;
  if (ratioNum <= 0n) return 0;
  if (ratioNum >= range) return 1;
  // Use midpoint threshold: < 0.5 -> 0, >= 0.5 -> 1
  // Compare 2*ratioNum with range to avoid floating point
  return 2n * ratioNum < range ? 0 : 1;
}
