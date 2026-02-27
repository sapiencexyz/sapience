type LastPositionForIntent = {
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
  mintedAt?: number;
};

export function useLastTradeForIntent(_params: {
  predictor?: string | null;
  outcomesSignature?: string | null;
  take?: number;
}) {
  return {
    data: null as LastPositionForIntent | null,
    isFetching: false,
    refetch: () => Promise.resolve(),
  };
}
