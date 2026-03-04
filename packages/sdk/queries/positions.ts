type PredictedOutcome = {
  conditionId: string;
  outcomeYes: boolean;
  condition?: {
    id: string;
    question?: string | null;
    shortName?: string | null;
    endTime?: number | null;
    description?: string | null;
    settled?: boolean;
    resolvedToYes?: boolean;
    resolver?: string | null;
    category?: {
      slug: string;
    } | null;
  } | null;
};

export type LegacyPosition = {
  id: number;
  chainId: number;
  marketAddress: string;
  predictor: string;
  counterparty: string;
  predictorNftTokenId: string;
  counterpartyNftTokenId: string;
  totalCollateral: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  refCode?: string | null;
  status: 'active' | 'settled' | 'consolidated';
  predictorWon?: boolean | null;
  mintedAt: number;
  settledAt?: number | null;
  endsAt?: number | null;
  predictions: PredictedOutcome[];
};
