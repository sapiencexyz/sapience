'use client';

export type PredictionChoice = 'YES' | 'NO' | 'OVER' | 'UNDER';

export type UmaPredictionLeg = {
  type: 'uma';
  id: string;
  question: string;
  conditionId?: string;
  categorySlug?: string | null;
  choice: 'YES' | 'NO';
};

export type PythPredictionLeg = {
  type: 'pyth';
  id: string;
  priceId: string;
  priceFeedLabel?: string;
  choice: 'OVER' | 'UNDER';
  targetPrice: number;
  dateTimeLocal: string;
  targetPriceRaw?: string;
  targetPriceFullPrecision?: string;
};

export type PredictionLeg = UmaPredictionLeg | PythPredictionLeg;


