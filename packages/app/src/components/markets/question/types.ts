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
  wager: number;
  predictor: string;
  counterparty: string;
  predictorPrediction: boolean; // true = predictor (maker) predicts YES, false = NO
  predictorCollateral: number; // Predictor's wager amount
  counterpartyCollateral: number; // Counterparty's wager amount
  time: string;
  combinedPredictions?: CombinedPrediction[];
  combinedWithYes?: boolean; // true = combined predictions are tied to YES outcome
  comment?: string; // Optional comment text from forecast
  attester?: string; // Forecaster's address
  predictionPercent?: number; // Prediction as percentage (0-100)
};

// Type for forecast data used in scatter plot
export type ForecastData = {
  x: number;
  y: number;
  time: string;
  attester: string;
  comment: string;
};
