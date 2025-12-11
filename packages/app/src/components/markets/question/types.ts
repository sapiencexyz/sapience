// Type for combined prediction in a parlay
export type CombinedPrediction = {
  question: string;
  prediction: boolean;
  categorySlug?: string;
};

// Type for prediction data used in scatter plot and table
export type PredictionData = {
  x: number;
  y: number;
  wager: number;
  maker: string;
  taker: string;
  makerPrediction: boolean; // true = maker predicts YES, false = maker predicts NO
  makerCollateral: number; // Maker's wager amount
  takerCollateral: number; // Taker's wager amount
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

