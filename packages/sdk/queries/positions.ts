import { graphqlRequest } from './client/graphqlClient';
import { fetchConditionsByIds } from './conditions';

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

export type Position = {
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

const USER_POSITIONS_QUERY = /* GraphQL */ `
  query UserPositions(
    $address: String!
    $take: Int
    $skip: Int
    $orderBy: String
    $orderDirection: String
    $chainId: Int
    $status: String
    $endsAtGte: Int
  ) {
    positions(
      address: $address
      take: $take
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      chainId: $chainId
      status: $status
      endsAtGte: $endsAtGte
    ) {
      id
      chainId
      marketAddress
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      totalCollateral
      predictorCollateral
      counterpartyCollateral
      refCode
      status
      predictorWon
      mintedAt
      settledAt
      endsAt
      predictions {
        conditionId
        outcomeYes
        condition {
          id
          question
          endTime
          resolver
        }
      }
    }
  }
`;

const CONDITIONS_BY_IDS_ENRICHMENT = /* GraphQL */ `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      shortName
      description
      settled
      resolvedToYes
      resolver
      category {
        slug
      }
    }
  }
`;

type CondEnrichRow = {
  id: string;
  shortName?: string | null;
  description?: string | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  resolver?: string | null;
  category?: { slug: string } | null;
};

function enrichPositions(
  base: Position[],
  conditionDataMap: Map<string, CondEnrichRow>
): Position[] {
  return base.map((p) => ({
    ...p,
    predictions: (p.predictions || []).map((o) => {
      const condData = conditionDataMap.get(o.conditionId);
      if (!condData) return o;
      return {
        ...o,
        condition: o.condition
          ? {
              ...o.condition,
              shortName: condData.shortName ?? o.condition.shortName,
              description: condData.description ?? o.condition.description,
              category: condData.category ?? o.condition.category,
              settled: condData.settled,
              resolvedToYes: condData.resolvedToYes,
              resolver: condData.resolver ?? o.condition.resolver,
            }
          : undefined,
      };
    }),
  }));
}

async function fetchAndEnrichConditions(base: Position[]): Promise<Map<string, CondEnrichRow>> {
  const conditionIds = Array.from(
    new Set(
      base.flatMap((p) => (p.predictions || []).map((o) => o.conditionId))
    )
  );
  if (conditionIds.length === 0) return new Map();

  const condRows = await fetchConditionsByIds<CondEnrichRow>(
    CONDITIONS_BY_IDS_ENRICHMENT,
    conditionIds
  );
  return new Map(condRows.map((c) => [c.id, c]));
}

export async function fetchUserPositionsCount(
  address: string,
  chainId?: number
): Promise<number> {
  const resp = await graphqlRequest<{ positionsCount: number }>(
    /* GraphQL */ `
      query PositionsCount($address: String!, $chainId: Int) {
        positionsCount(address: $address, chainId: $chainId)
      }
    `,
    { address, chainId: chainId ?? null }
  );
  return resp?.positionsCount ?? 0;
}

export async function fetchUserPositions(params: {
  address: string;
  take?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: string;
  chainId?: number;
  status?: string;
  endsAtGte?: number;
}): Promise<Position[]> {
  const {
    address,
    take = 50,
    skip = 0,
    orderBy,
    orderDirection,
    chainId,
    status,
    endsAtGte,
  } = params;

  const resp = await graphqlRequest<{ positions: Position[] }>(
    USER_POSITIONS_QUERY,
    {
      address,
      take,
      skip,
      orderBy,
      orderDirection,
      chainId: chainId ?? null,
      status: status ?? null,
      endsAtGte: endsAtGte ?? null,
    }
  );
  const base = resp?.positions ?? [];
  const conditionDataMap = await fetchAndEnrichConditions(base);
  if (conditionDataMap.size === 0) return base;
  return enrichPositions(base, conditionDataMap);
}

// --- Positions by condition ID ---

const POSITIONS_BY_CONDITION_ID_QUERY = /* GraphQL */ `
  query PositionsByConditionId(
    $conditionId: String!
    $take: Int
    $skip: Int
    $chainId: Int
  ) {
    positionsByConditionId(
      conditionId: $conditionId
      take: $take
      skip: $skip
      chainId: $chainId
    ) {
      id
      chainId
      marketAddress
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      totalCollateral
      predictorCollateral
      counterpartyCollateral
      refCode
      status
      predictorWon
      mintedAt
      settledAt
      endsAt
      predictions {
        conditionId
        outcomeYes
        condition {
          id
          question
          shortName
          endTime
        }
      }
    }
  }
`;

const POSITIONS_CONDITIONS_ENRICHMENT = /* GraphQL */ `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      shortName
      description
      resolver
      category {
        slug
      }
    }
  }
`;

export async function fetchPositionsByConditionId(params: {
  conditionId: string;
  take?: number;
  skip?: number;
  chainId?: number;
}): Promise<Position[]> {
  const { conditionId, take = 100, skip = 0, chainId } = params;

  const resp = await graphqlRequest<{ positionsByConditionId: Position[] }>(
    POSITIONS_BY_CONDITION_ID_QUERY,
    {
      conditionId,
      take,
      skip,
      chainId: chainId ?? null,
    }
  );
  const base = resp?.positionsByConditionId ?? [];

  const conditionIds = Array.from(
    new Set(
      base.flatMap((p) => (p.predictions || []).map((o) => o.conditionId))
    )
  );

  if (conditionIds.length === 0) return base;

  type CondRow = {
    id: string;
    shortName?: string | null;
    description?: string | null;
    resolver?: string | null;
    category?: { slug: string } | null;
  };
  const condRows = await fetchConditionsByIds<CondRow>(
    POSITIONS_CONDITIONS_ENRICHMENT,
    conditionIds
  );
  const conditionDataMap = new Map(condRows.map((c) => [c.id, c]));

  return base.map((p) => ({
    ...p,
    predictions: (p.predictions || []).map((o) => {
      const condData = conditionDataMap.get(o.conditionId);
      if (!condData) return o;
      return {
        ...o,
        condition: o.condition
          ? {
              ...o.condition,
              shortName: condData.shortName ?? o.condition.shortName,
              description: condData.description ?? o.condition.description,
              category: condData.category ?? o.condition.category,
              resolver: condData.resolver ?? o.condition.resolver,
            }
          : undefined,
      };
    }),
  }));
}

// --- Recent positions ---

const RECENT_POSITIONS_QUERY = /* GraphQL */ `
  query RecentPositions(
    $take: Int
    $skip: Int
    $chainId: Int
    $status: String
  ) {
    recentPositions(
      take: $take
      skip: $skip
      chainId: $chainId
      status: $status
    ) {
      id
      chainId
      marketAddress
      predictor
      counterparty
      predictorNftTokenId
      counterpartyNftTokenId
      totalCollateral
      predictorCollateral
      counterpartyCollateral
      refCode
      status
      predictorWon
      mintedAt
      settledAt
      endsAt
      predictions {
        conditionId
        outcomeYes
        condition {
          id
          question
          shortName
          endTime
          resolver
          settled
          resolvedToYes
          category {
            slug
          }
        }
      }
    }
  }
`;

export async function fetchRecentPositions(params: {
  take?: number;
  skip?: number;
  chainId?: number;
  status?: string;
}): Promise<Position[]> {
  const { take = 20, skip = 0, chainId, status } = params;

  const resp = await graphqlRequest<{ recentPositions: Position[] }>(
    RECENT_POSITIONS_QUERY,
    {
      take,
      skip,
      chainId: chainId ?? null,
      status: status ?? null,
    }
  );
  return resp?.recentPositions ?? [];
}
