import { graphqlRequest } from './client/graphqlClient';

/**
 * @deprecated Legacy V1 type — will be removed when V2 predictions expose pickConfig.
 */
export type LastPositionForIntent = {
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
};

/**
 * @deprecated Legacy V1 query — uses legacyPositions for trade history lookup.
 * V2 predictions don't expose pickConfig yet, so new escrow trades won't match.
 */
const POSITIONS_FOR_LAST_TRADE_QUERY = /* GraphQL */ `
  query PositionsForLastTrade($address: String!, $take: Int) {
    legacyPositions(address: $address, take: $take) {
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

/**
 * @deprecated Legacy V1 — will be replaced with V2 predictions query.
 */
export async function fetchLastTradePositions(
  predictor: string,
  take = 100
): Promise<{ positions: PositionWithPredictions[] }> {
  const resp = await graphqlRequest<{ legacyPositions: PositionWithPredictions[] }>(
    POSITIONS_FOR_LAST_TRADE_QUERY,
    { address: predictor, take: Math.min(take, 100) }
  );
  return { positions: resp?.legacyPositions ?? [] };
}

/**
 * @deprecated Legacy V1 — matches by outcomeYes, will use predictedOutcome in V2.
 */
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
