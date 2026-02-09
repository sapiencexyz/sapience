// Type for combined prediction in a position
export type CombinedPrediction = {
  conditionId: string;
  resolverAddress?: string;
  question: string;
  prediction: boolean;
  categorySlug?: string;
};

// Type for prediction data used in scatter plot and table
export type PredictionData = {
  x: number;
  y: number;
  positionSize: number;
  predictor: string;
  counterparty: string;
  predictorPrediction: boolean; // true = predictor (maker) predicts YES, false = NO
  predictorCollateral: number; // Predictor's position size
  counterpartyCollateral: number; // Counterparty's position size
  time: string;
  combinedPredictions?: CombinedPrediction[];
  combinedWithYes?: boolean; // true = combined predictions are tied to YES outcome
  comment?: string; // Optional comment text from forecast
  attester?: string; // Forecaster's address
  predictionPercent?: number; // Prediction as percentage (0-100)
  marketAddress?: string; // Market contract address for position link
  nftTokenId?: string; // NFT token ID for position link
};

// Type for forecast data used in scatter plot
export type ForecastData = {
  x: number;
  y: number;
  time: string;
  attester: string;
  comment: string;
};
