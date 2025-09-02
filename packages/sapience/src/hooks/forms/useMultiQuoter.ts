import type { MarketGroupType } from '@sapience/ui/types';
import { MarketGroupClassification } from '~/lib/types';
import { YES_SQRT_PRICE_X96 } from '~/lib/utils/betslipUtils';

export interface PositionQuoteData {
  positionId: string;
  marketGroupData: MarketGroupType;
  marketClassification: MarketGroupClassification;
  predictionValue: string;
  wagerAmount: string;
  selectedMarketId?: number;
}

export interface QuoteParams {
  marketData: MarketGroupType;
  marketId: number;
  expectedPrice: number;
  wagerAmount: string;
}

// Helper function to convert position data to quote parameters
export function getQuoteParamsFromPosition(
  position: PositionQuoteData
): QuoteParams {
  const {
    marketGroupData,
    marketClassification,
    predictionValue,
    wagerAmount,
  } = position;

  // Calculate expected price and marketId based on market classification
  let expectedPrice: number;
  let marketId: number;

  switch (marketClassification) {
    case MarketGroupClassification.YES_NO:
      expectedPrice = predictionValue === YES_SQRT_PRICE_X96 ? 1 : 0.0000009;
      // Prefer an explicitly selected market when provided (e.g., multi-choice treated as YES/NO)
      marketId =
        position.selectedMarketId ??
        marketGroupData.markets?.[0]?.marketId ??
        0;
      break;
    case MarketGroupClassification.MULTIPLE_CHOICE:
      expectedPrice = 1; // 1 for YES
      marketId = Number(predictionValue);
      break;
    case MarketGroupClassification.NUMERIC:
      expectedPrice = Number(predictionValue);
      marketId = marketGroupData.markets?.[0]?.marketId ?? 0;
      break;
    default:
      expectedPrice = 1;
      marketId = 0;
  }

  return {
    marketData: marketGroupData,
    marketId,
    expectedPrice,
    wagerAmount,
  };
}
