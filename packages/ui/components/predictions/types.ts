'use client';

export type PredictionChoice = 'YES' | 'NO';

export type PythPrediction = {
  id: string;
  priceId: string;
  priceFeedLabel?: string;
  direction: 'over' | 'under';
  targetPrice: number;
  targetPriceRaw?: string;
  targetPriceFullPrecision?: string;
  /** Pyth exponent (int32) used for on-chain resolver encoding. */
  priceExpo: number;
  dateTimeLocal: string;
};
