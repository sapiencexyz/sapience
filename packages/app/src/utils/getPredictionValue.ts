import { MarketGroupClassification } from '~/lib/types';

/**
 * Convert prediction input to D18 format (18 decimal places)
 * For probability predictions: 50% = 50 * 10^18
 * For numeric predictions: value * 10^18
 */
export function getPredictionValue(
  classification: MarketGroupClassification,
  predictionInput: string
) {
  let finalPredictionBigInt: bigint;

  switch (classification) {
    case MarketGroupClassification.NUMERIC: {
      console.log('predictionInput numeric', predictionInput);
      const inputNum = parseFloat(predictionInput);
      if (Number.isNaN(inputNum) || inputNum < 0) {
        throw new Error(
          'Numeric prediction input must be a valid non-negative number.'
        );
      }
      // D18 format: value * 10^18
      finalPredictionBigInt = BigInt(Math.round(inputNum * 1e18));
      break;
    }
    case MarketGroupClassification.YES_NO:
      console.log('predictionInput yes no', predictionInput);
      // predictionInput is already the probability value (0-100)
      // Convert to D18: prob * 10^18
      finalPredictionBigInt = BigInt(
        Math.round(parseFloat(predictionInput) * 1e18)
      );
      break;
    case MarketGroupClassification.MULTIPLE_CHOICE:
      console.log('predictionInput multiple choice', predictionInput);
      // predictionInput is already the probability value (0-100)
      // Convert to D18: prob * 10^18
      finalPredictionBigInt = BigInt(
        Math.round(parseFloat(predictionInput) * 1e18)
      );
      break;
    default: {
      // This will catch any unhandled enum members at compile time
      const _exhaustiveCheck: never = classification;
      throw new Error(
        `Unsupported market classification for encoding: ${_exhaustiveCheck}`
      );
    }
  }

  return finalPredictionBigInt;
}
