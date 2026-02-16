import { graphqlRequest } from './client/graphqlClient';

export type LastPositionForIntent = {
  mintedAt: number;
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
};

const POSITIONS_FOR_LAST_TRADE_QUERY = /* GraphQL */ `
  query PositionsForLastTrade($address: String!, $take: Int) {
    positions(address: $address, take: $take) {
      mintedAt
      predictor
      counterparty
      predictorCollateral
      counterpartyCollateral
      totalCollateral
      predictions {
        conditionId
        outcomeYes
      }
    }
  }
`;

type PositionWithPredictions = {
  mintedAt: number;
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
  predictions: Array<{ conditionId: string; outcomeYes: boolean }>;
};

export async function fetchLastTradePositions(
  predictor: string,
  take = 100
): Promise<{ positions: PositionWithPredictions[] }> {
  return await graphqlRequest<{ positions: PositionWithPredictions[] }>(
    POSITIONS_FOR_LAST_TRADE_QUERY,
    { address: predictor, take: Math.min(take, 100) }
  );
}

export function findMatchingPosition(
  positions: PositionWithPredictions[],
  outcomesSignature: string
): LastPositionForIntent | null {
  const normalize = (
    arr: Array<{ conditionId: string; outcomeYes: boolean }>
  ) =>
    JSON.stringify(
      (arr || [])
        .map((o) => ({
          conditionId: String(o.conditionId).toLowerCase(),
          prediction: !!o.outcomeYes,
        }))
        .sort((a, b) =>
          a.conditionId === b.conditionId
            ? Number(a.prediction) - Number(b.prediction)
            : a.conditionId.localeCompare(b.conditionId)
        )
    );

  return positions.find((p) => normalize(p.predictions) === outcomesSignature) || null;
}
