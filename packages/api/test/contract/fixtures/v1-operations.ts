/**
 * FROZEN copies of the v1 operation documents the contract suite pins.
 *
 * Why frozen: the live constants in @sapience/sdk/queries flip to v2
 * documents during the consumer migration (PR #1823). The v1 contract
 * tests (and the v1 side of every parity pair) must keep exercising the
 * EXACT v1 wire contract, so the op text is snapshotted here instead of
 * imported from the SDK. Do not edit by hand; if a v1 op legitimately
 * changes (it should not — v1 is frozen), regenerate via the command in
 * the README. Generated from @sapience/sdk/queries at the commit that
 * introduced this file.
 */

export const GET_CONDITIONS = /* GraphQL */ `
  query Conditions($take: Int, $skip: Int, $where: ConditionWhereInput) {
    conditions(
      orderBy: { createdAt: desc }
      take: $take
      skip: $skip
      where: $where
    ) {
      id
      createdAt
      question
      shortName
      optionName
      endTime
      public
      description
      similarMarkets
      chainId
      resolver
      settled
      resolvedToYes
      nonDecisive
      assertionId
      assertionTimestamp
      openInterest
      similarMarketVolume
      similarMarketImage
      estimatedPrice
      conditionGroupId
      conditionGroup {
        id
        name
      }
      category {
        id
        name
        slug
      }
    }
  }
`;

export const CONDITIONS_BY_IDS_QUERY = /* GraphQL */ `
  query ConditionsByIds($where: ConditionWhereInput!) {
    conditions(where: $where, take: 100) {
      id
      shortName
      optionName
      question
      description
      endTime
      resolver
      similarMarkets
      settled
      resolvedToYes
      nonDecisive
      estimatedPrice
      category {
        slug
      }
    }
  }
`;

export const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int
    $skip: Int
    $where: ConditionGroupWhereInput
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroups(
      orderBy: [{ createdAt: desc }]
      take: $take
      skip: $skip
      where: $where
    ) {
      id
      createdAt
      name
      category {
        id
        name
        slug
      }
      conditions(
        orderBy: [{ displayOrder: { sort: asc } }]
        where: $conditionsWhere
      ) {
        id
        createdAt
        question
        shortName
        optionName
        endTime
        public
        description
        similarMarkets
        chainId
        resolver
        settled
        resolvedToYes
        nonDecisive
        assertionId
        assertionTimestamp
        openInterest
        similarMarketVolume
        similarMarketImage
        estimatedPrice
        conditionGroupId
        category {
          id
          name
          slug
        }
        displayOrder
      }
    }
  }
`;

export const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories {
      id
      name
      slug
    }
  }
`;

export const GET_QUESTIONS = /* GraphQL */ `
  query Questions(
    $take: Int!
    $skip: Int!
    $chainId: Int
    $sortField: QuestionSortField!
    $sortDirection: SortOrder!
    $search: String
    $categorySlugs: [String!]
    $minEndTime: Int
    $resolutionStatus: ResolutionStatus
    $minEstimatedPrice: Float
    $maxEstimatedPrice: Float
    $minSimilarMarketVolume: Float
    $maxSimilarMarketVolume: Float
    $tag: String
    $similarMarketVolumeWindow: VolumeWindow
  ) {
    questions(
      take: $take
      skip: $skip
      chainId: $chainId
      sortField: $sortField
      sortDirection: $sortDirection
      search: $search
      categorySlugs: $categorySlugs
      minEndTime: $minEndTime
      resolutionStatus: $resolutionStatus
      minEstimatedPrice: $minEstimatedPrice
      maxEstimatedPrice: $maxEstimatedPrice
      minSimilarMarketVolume: $minSimilarMarketVolume
      maxSimilarMarketVolume: $maxSimilarMarketVolume
      tag: $tag
      similarMarketVolumeWindow: $similarMarketVolumeWindow
    ) {
      questionType
      group {
        id
        createdAt
        name
        category {
          id
          name
          slug
        }
        conditions {
          id
          createdAt
          question
          shortName
          optionName
          endTime
          public
          description
          similarMarkets
          tags
          chainId
          resolver
          settled
          resolvedToYes
          nonDecisive
          assertionId
          assertionTimestamp
          openInterest
          similarMarketVolume
          similarMarketImage
          estimatedPrice
          similarMarketVolume1h
          similarMarketVolume4h
          similarMarketVolume24h
          similarMarketVolume7d
          similarMarketVolumeFiltered1h
          similarMarketVolumeFiltered4h
          similarMarketVolumeFiltered24h
          similarMarketVolumeFiltered7d
          conditionGroupId
          category {
            id
            name
            slug
          }
          displayOrder
        }
      }
      condition {
        id
        createdAt
        question
        shortName
        endTime
        public
        description
        similarMarkets
        tags
        chainId
        resolver
        settled
        resolvedToYes
        nonDecisive
        assertionId
        assertionTimestamp
        openInterest
        similarMarketVolume
        similarMarketImage
        estimatedPrice
        similarMarketVolume1h
        similarMarketVolume4h
        similarMarketVolume24h
        similarMarketVolume7d
        similarMarketVolumeFiltered1h
        similarMarketVolumeFiltered4h
        similarMarketVolumeFiltered24h
        similarMarketVolumeFiltered7d
        conditionGroupId
        category {
          id
          name
          slug
        }
      }
    }
  }
`;

export const GET_PICK_CONFIGURATIONS = /* GraphQL */ `
  query PickConfigurations(
    $take: Int
    $skip: Int
    $chainId: Int
    $resolved: Boolean
  ) {
    pickConfigurations(
      take: $take
      skip: $skip
      chainId: $chainId
      resolved: $resolved
    ) {
      id
      chainId
      totalPredictorCollateral
      totalCounterpartyCollateral
      resolved
      picks {
        conditionId
        conditionResolver
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
`;

export const GET_POPULAR_TAGS = /* GraphQL */ `
  query PopularTags {
    popularTags
  }
`;

export const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats($vaultAddress: String) {
    protocolStats(vaultAddress: $vaultAddress) {
      timestamp
      cumulativeVolume
      totalTradeCount
      periodTradeCount
      openInterest
      vaultBalance
      vaultAvailableAssets
      vaultDeployed
      escrowBalance
      vaultCumulativePnL
      vaultPositionsWon
      vaultPositionsLost
      vaultDeposits
      vaultWithdrawals
      vaultAirdropGains
      vaultSecondaryBought
      vaultSecondarySold
      periodPnL
      periodVolume
    }
  }
`;

export const GET_OPEN_INTEREST_BY_CATEGORY = /* GraphQL */ `
  query OpenInterestByCategory {
    openInterestByCategory {
      category {
        id
        name
        slug
      }
      openInterest
    }
  }
`;

export const GET_OPEN_INTEREST_BY_TIME_TO_RESOLUTION = /* GraphQL */ `
  query OpenInterestByTimeToResolution {
    openInterestByTimeToResolution {
      bucket
      label
      openInterest
      predictionCount
    }
  }
`;

export const GET_PROFIT_LEADERBOARD = /* GraphQL */ `
  query ProfitLeaderboard($limit: Int, $skip: Int) {
    profitLeaderboard(limit: $limit, skip: $skip) {
      address
      totalPnL
    }
  }
`;

export const GET_ACCURACY_LEADERBOARD = /* GraphQL */ `
  query AccuracyLeaderboard($limit: Int!) {
    accuracyLeaderboard(limit: $limit) {
      address
      numScored
      sumErrorSquared
      numTimeWeighted
      sumTimeWeightedError
      accuracyScore
    }
  }
`;

export const GET_ACCOUNT_ACCURACY_RANK = /* GraphQL */ `
  query AccountAccuracyRank($address: String!) {
    accountAccuracyRank(address: $address) {
      address
      accuracyScore
      rank
      totalForecasters
    }
  }
`;

export const GET_ATTESTATIONS_QUERY = /* GraphQL */ `
  query FindAttestations($where: AttestationWhereInput!, $take: Int!) {
    attestations(where: $where, orderBy: { time: desc }, take: $take) {
      id
      uid
      attester
      time
      prediction
      comment
      conditionId
    }
  }
`;

export const GET_ATTESTATIONS_PAGINATED_QUERY = /* GraphQL */ `
  query FindAttestationsPaginated(
    $where: AttestationWhereInput!
    $take: Int!
    $cursor: AttestationWhereUniqueInput
    $skip: Int
    $orderBy: [AttestationOrderByWithRelationInput!]
  ) {
    attestations(
      where: $where
      orderBy: $orderBy
      take: $take
      cursor: $cursor
      skip: $skip
    ) {
      id
      uid
      attester
      time
      prediction
      comment
      conditionId
    }
  }
`;
