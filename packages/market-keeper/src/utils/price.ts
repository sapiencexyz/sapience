/**
 * Parse YES price from Polymarket outcomePrices field.
 * Handles both JSON string and array formats.
 * Returns undefined if parsing fails or value is outside [0, 1].
 */
export function parseYesPrice(
  outcomePrices: string | number[] | undefined
): number | undefined {
  if (outcomePrices == null) return undefined;

  let rawPrices: unknown[] = [];
  if (typeof outcomePrices === 'string') {
    try {
      rawPrices = JSON.parse(outcomePrices) as unknown[];
    } catch {
      return undefined;
    }
  } else if (Array.isArray(outcomePrices)) {
    rawPrices = outcomePrices;
  }

  if (rawPrices.length === 0) return undefined;

  // Index 0 is always YES
  const yesPrice = Number(rawPrices[0]);
  if (!Number.isFinite(yesPrice) || yesPrice < 0 || yesPrice > 1) {
    return undefined;
  }

  return yesPrice;
}
