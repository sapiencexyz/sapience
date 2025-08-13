import { MarketGroupClassification } from '~/lib/types';

export function getPredictionValue(
  classification: MarketGroupClassification,
  predictionInput: string
) {
  let finalPredictionBigInt: bigint;
  const JS_2_POW_96 = 2 ** 96;

  switch (classification) {
    case MarketGroupClassification.NUMERIC: {
      console.log('predictionInput numeric', predictionInput);
      const inputNum = parseFloat(predictionInput);
      if (Number.isNaN(inputNum) || inputNum < 0) {
        throw new Error(
          'Numeric prediction input must be a valid non-negative number.'
        );
      }
      const effectivePrice = inputNum * 10 ** 18;
      const sqrtEffectivePrice = Math.sqrt(effectivePrice);
      const sqrtPriceX96Float = sqrtEffectivePrice * JS_2_POW_96;
      finalPredictionBigInt = BigInt(Math.round(sqrtPriceX96Float));
      break;
    }
    case MarketGroupClassification.YES_NO:
      console.log('predictionInput yes no', predictionInput);
      finalPredictionBigInt = BigInt(predictionInput);
      break;
    case MarketGroupClassification.MULTIPLE_CHOICE:
      console.log('predictionInput multiple choice', predictionInput);
      finalPredictionBigInt = BigInt(predictionInput);
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
