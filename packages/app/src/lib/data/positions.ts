// Position data fetch helpers.
// Shared across SSR pages and client components.

import { getGraphQLEndpoint } from './graphql';
import type { PositionBalance } from '~/hooks/graphql/usePositions';

// Mirrors POSITION_BALANCES_QUERY in usePositions.ts, narrowed to a single
// position row id. `picks.condition` is fetched inline so the page can build
// its conditionsMap without a follow-up conditions query.
export const POSITION_BY_ID_QUERY = `
  query PositionById($positionId: Int!) {
    positionsPage(positionId: $positionId, take: 50) {
      items {
        id
        chainId
        tokenAddress
        pickConfigId
        isPredictorToken
        holder
        balance
        userCollateral
        totalPayout
        realizedPnL
        createdAt
        updatedAt
        pickConfig {
          id
          chainId
          marketAddress
          totalPredictorCollateral
          totalCounterpartyCollateral
          claimedPredictorCollateral
          claimedCounterpartyCollateral
          resolved
          result
          resolvedAt
          predictorToken
          counterpartyToken
          endsAt
          isLegacy
          predictionId
          picks {
            id
            pickConfigId
            conditionResolver
            conditionId
            predictedOutcome
            condition {
              id
              shortName
              optionName
              question
              description
              endTime
              resolver
              settled
              resolvedToYes
              nonDecisive
              estimatedPrice
              category {
                slug
              }
            }
          }
        }
      }
    }
  }
`;

// Fetch a single position by its row id. The resolver synthesizes one row
// per secondary sell alongside the open/parent row (ids like "2887-sell-0x…"),
// so prefer the exact-id parent row and fall back to the first synthesized
// row (e.g. a fully sold, unresolved position has only sell rows).
// Returns null if not found. Throws on network errors.
export async function fetchPositionById(
  positionId: number
): Promise<PositionBalance | null> {
  if (!Number.isInteger(positionId) || positionId <= 0) return null;
  const endpoint = getGraphQLEndpoint();
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: POSITION_BY_ID_QUERY,
      variables: { positionId },
    }),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  const items: PositionBalance[] = json?.data?.positionsPage?.items ?? [];
  return items.find((p) => p.id === String(positionId)) ?? items[0] ?? null;
}
