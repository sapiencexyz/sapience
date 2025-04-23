/**
 * Utility functions for converting between tick values and readable price values
 */

/**
 * Converts a tick value to a price
 * @param tick The tick value to convert
 * @param tickSpacing Optional tick spacing to round to
 * @returns The price represented by the tick
 */
export const tickToPrice = (
  tick: number,
  tickSpacing: number = 200
): number => {
  // If tickSpacing is provided, round the tick to the nearest valid tick
  const roundedTick = tickSpacing
    ? Math.round(tick / tickSpacing) * tickSpacing
    : tick;
  // Use the standard formula: price = 1.0001^tick
  return 1.0001 ** roundedTick;
};

/**
 * Converts a price to the nearest tick value
 * @param price The price to convert
 * @param tickSpacing Optional tick spacing to round to
 * @returns The tick representing the price
 */
export const priceToTick = (
  price: number,
  tickSpacing: number = 200
): number => {
  // Convert price to tick using logarithm
  const tick = Math.log(price) / Math.log(1.0001);
  // Round to the nearest valid tick if tickSpacing is provided
  return tickSpacing
    ? Math.round(tick / tickSpacing) * tickSpacing
    : Math.round(tick);
};

/**
 * Converts a price to sqrtPriceX96 format used by Uniswap V3
 * @param price The price to convert
 * @returns The sqrtPriceX96 value
 */
export const priceToSqrtPriceX96 = (price: number): bigint => {
  // Calculate the square root of the price
  const sqrtPrice = Math.sqrt(price);

  // Calculate 2^96 without using bigint exponentiation
  // 2^96 = 79228162514264337593543950336
  const Q96 = BigInt('79228162514264337593543950336');

  // Convert to bigint format required by the Uniswap contracts
  return BigInt(Math.floor(sqrtPrice * Number(Q96)));
};

/**
 * Creates an object with both tick and price values
 * @param value The input value (either tick or price)
 * @param isTick Whether the input value is a tick
 * @param tickSpacing Optional tick spacing to round to
 * @returns An object containing both tick and price values
 */
export const createTickPriceValue = (
  value: number | string,
  isTick: boolean,
  tickSpacing: number = 200
): { tick: number; price: number } => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isTick) {
    return {
      tick: numValue,
      price: tickToPrice(numValue, tickSpacing),
    };
  } else {
    return {
      tick: priceToTick(numValue, tickSpacing),
      price: numValue,
    };
  }
};

/**
 * Formats a price value to a specified number of decimal places
 * @param price The price to format
 * @param decimals The number of decimal places to show (default: 6)
 * @returns A formatted price string
 */
export const formatPrice = (price: number | string, decimals = 6): string => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;

  // Handle edge cases
  if (isNaN(numPrice)) return '0';

  // For numbers that are very small, use scientific notation
  if (numPrice > 0 && numPrice < 0.000001) {
    return numPrice.toExponential(decimals);
  }

  // For normal numbers, fix to the specified number of decimals
  return numPrice.toFixed(decimals);
};
