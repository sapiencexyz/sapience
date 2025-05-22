import { graphql, GraphQLSchema } from 'graphql';
import { initializeApolloServer } from '../graphql/startApolloServer';
import { ToolResponse } from '.';

let schema: GraphQLSchema;

async function initializeSchema() {
  if (!schema) {
    const apolloServer = await initializeApolloServer();
    // @ts-expect-error - HACK: accessing private variable for now
    schema = apolloServer.schema;
  }
}

// Initialize schema when the module loads
initializeSchema();

interface GraphQLResponse {
  data?: Record<string, unknown>;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

async function executeGraphQLQuery(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse> {
  if (!schema) {
    await initializeSchema(); // Ensure schema is initialized
    if (!schema) {
      // Check again, and throw if still not initialized.
      throw new Error('GraphQL schema is not initialized.');
    }
  }
  // Directly use the graphql execution engine
  const result = await graphql({
    schema,
    source: query,
    variableValues: variables,
    // contextValue: {}, // Add context if needed by resolvers
    // rootValue: {}, // Add rootValue if needed
  });

  // Adapt the result to the existing GraphQLResponse structure
  return {
    data: result.data || undefined,
    errors: result.errors as GraphQLResponse['errors'], // Cast to expected type
  };
}

// Market Tools
const getMarketGroup = {
  name: 'get_sapience_market_group',
  description:
    'Gets detailed information about a specific market group by its address and chain ID',
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The address of the market group',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market group exists',
      },
    },
    required: ['address', 'chainId'],
  },
  function: async ({
    address,
    chainId,
  }: {
    address: string;
    chainId: string;
  }): Promise<ToolResponse> => {
    const query = `
      query GetMarketGroup($address: String!, $chainId: Int!) {
        marketGroup(address: $address, chainId: $chainId) {
          address
          chainId
          collateralAsset
          deployTimestamp
          deployTxnBlockNumber
          id
          isCumulative
          owner
          vaultAddress
          markets {
            id
            marketId
            startTimestamp
            endTimestamp
            settled
            settlementPriceD18
            public
          }
          resource {
            id
            name
            slug
          }
          # Added missing fields from MarketGroupType
          baseTokenName
          claimStatement
          collateralDecimals
          collateralSymbol
          factoryAddress
          initializationNonce
          minTradeSize
          question
          quoteTokenName
          marketParams {
            assertionLiveness
            bondAmount
            bondCurrency
            claimStatement
            feeRate
            optimisticOracleV3
            uniswapPositionManager
            uniswapQuoter
            uniswapSwapRouter
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query, {
      address,
      chainId: parseInt(chainId),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.marketGroup, null, 2),
        },
      ],
    };
  },
};

const getMarket = {
  name: 'get_sapience_market',
  description:
    'Gets detailed information about a specific market by its chain ID, market address, and market ID.',
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'The chain ID where the market exists.',
      },
      marketAddress: {
        type: 'string',
        description: 'The address of the market group.',
      },
      marketId: {
        type: 'string',
        description: 'The ID of the market.',
      },
    },
    required: ['chainId', 'marketAddress', 'marketId'],
  },
  function: async ({
    chainId,
    marketAddress,
    marketId,
  }: {
    chainId: string;
    marketAddress: string;
    marketId: string;
  }): Promise<ToolResponse> => {
    // The schema has markets(chainId: Int!, marketAddress: String!, marketId: Int!): [MarketType!]!
    // It returns an array, so we'll query for that and typically expect one result for a specific marketId.
    const query = `
      query GetMarket($chainId: Int!, $marketAddress: String!, $marketId: Int!) {
        markets(chainId: $chainId, marketAddress: $marketAddress, marketId: $marketId) {
          id
          marketId
          baseAssetMaxPriceTick
          baseAssetMinPriceTick
          currentPrice
          endTimestamp
          marketGroup {
            address # To identify the parent market group
            id
          }
          optionName
          poolAddress
          public
          question
          settled
          settlementPriceD18
          startTimestamp
          startingSqrtPriceX96
        }
      }
    `;
    const result = await executeGraphQLQuery(query, {
      chainId: parseInt(chainId),
      marketAddress,
      marketId: parseInt(marketId),
    });
    // Since the schema returns an array, we send back the array.
    // If a single market is always expected, the consumer can take the first element.
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.markets, null, 2),
        },
      ],
    };
  },
};

const getMarketGroups = {
  name: 'get_sapience_market_groups',
  description:
    'Lists all market groups available in the Foil system, optionally filtering by chain ID or collateral asset.',
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'Optional chain ID to filter market groups by.',
      },
      collateralAsset: {
        type: 'string',
        description: 'Optional collateral asset to filter market groups by.',
      },
    },
    required: [], // All parameters are optional
  },
  function: async ({
    chainId,
    collateralAsset,
  }: {
    chainId?: string;
    collateralAsset?: string;
  }): Promise<ToolResponse> => {
    const query = `
      query GetMarketGroups($chainId: Int, $collateralAsset: String) {
        marketGroups(chainId: $chainId, collateralAsset: $collateralAsset) {
          id
          address
          chainId
          baseTokenName
          claimStatement
          collateralAsset
          collateralDecimals
          collateralSymbol
          deployTimestamp
          deployTxnBlockNumber
          factoryAddress
          initializationNonce
          isCumulative
          # isYin removed
          minTradeSize
          owner
          question
          quoteTokenName
          resource {
            id
            name
            slug
          }
          marketParams {
            assertionLiveness
            bondAmount
            bondCurrency
            claimStatement # Specific to market params
            feeRate
            optimisticOracleV3
            uniswapPositionManager
            uniswapQuoter
            uniswapSwapRouter
          }
          markets { # List all markets within each group
            id
            marketId
            baseAssetMaxPriceTick
            baseAssetMinPriceTick
            currentPrice
            endTimestamp
            optionName
            poolAddress
            public
            question # Specific to market
            settled
            settlementPriceD18
            startTimestamp
            startingSqrtPriceX96
          }
        }
      }
    `;

    const variables: Record<string, string | number> = {};
    if (chainId) variables.chainId = parseInt(chainId);
    if (collateralAsset) variables.collateralAsset = collateralAsset;

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.marketGroups, null, 2),
        },
      ],
    };
  },
};

// New tool to list markets with more specific market filters
const getMarkets = {
  name: 'get_sapience_markets',
  description:
    'Lists all markets, optionally filtering by a specific market group (using marketGroupAddress and chainId), or by chain ID (for all market groups on that chain), and/or active status.',
  parameters: {
    properties: {
      marketGroupAddress: {
        // Added to specify a single market group
        type: 'string',
        description:
          'Optional address of a specific market group to fetch markets from. If provided, chainId is also required.',
      },
      chainId: {
        type: 'string',
        description:
          'Optional chain ID. Required if marketGroupAddress is provided. Otherwise, filters market groups by this chain ID.',
      },
      isActive: {
        type: 'boolean',
        description:
          'Optional boolean to filter for markets that are currently active (end time in the future). Defaults to false (include all markets).',
      },
    },
    required: [],
  },
  function: async ({
    marketGroupAddress,
    chainId,
    isActive,
  }: {
    marketGroupAddress?: string;
    chainId?: string;
    isActive?: boolean;
  }): Promise<ToolResponse> => {
    interface MarketFilterInput {
      endTimestamp_gt?: string;
    }

    interface Market {
      id: string;
      marketId: string;
      // Add other properties as needed
      [key: string]: unknown;
    }

    interface MarketGroup {
      markets?: Market[];
      [key: string]: unknown;
    }

    const marketFilterInput: MarketFilterInput = {};
    if (isActive) {
      const nowInSeconds = Math.floor(Date.now() / 1000).toString();
      marketFilterInput.endTimestamp_gt = nowInSeconds;
    }

    let query;
    const variables: Record<string, string | number | MarketFilterInput> = {
      marketFilter: marketFilterInput,
    };

    let allMarkets: Market[] = [];

    if (marketGroupAddress) {
      if (!chainId) {
        throw new Error(
          'chainId is required when marketGroupAddress is provided.'
        );
      }
      query = `
        query GetMarketsFromGroup($address: String!, $chainId: Int!, $marketFilter: MarketFilterInput) {
          marketGroup(address: $address, chainId: $chainId) {
            markets(filter: $marketFilter) {
              id
              marketId
              baseAssetMaxPriceTick
              baseAssetMinPriceTick
              currentPrice
              endTimestamp
              optionName
              poolAddress
              public
              question
              settled
              settlementPriceD18
              startTimestamp
              startingSqrtPriceX96
              marketGroup { # Include parent market group info for context
                id
                address
                chainId
                claimStatement
              }
            }
          }
        }
      `;
      variables.address = marketGroupAddress;
      variables.chainId = parseInt(chainId);
      const result = await executeGraphQLQuery(query, variables);

      const marketGroup = result.data?.marketGroup as MarketGroup | undefined;
      if (marketGroup?.markets && Array.isArray(marketGroup.markets)) {
        allMarkets = marketGroup.markets;
      }
    } else {
      // Query across multiple market groups, optionally filtered by chainId
      query = `
        query GetFilteredMarkets($chainId: Int, $marketFilter: MarketFilterInput) {
          marketGroups(chainId: $chainId) { # Filter market groups by chainId if provided
            markets(filter: $marketFilter) { # Apply market filter here
              id
              marketId
              baseAssetMaxPriceTick
              baseAssetMinPriceTick
              currentPrice
              endTimestamp
              optionName
              poolAddress
              public
              question
              settled
              settlementPriceD18
              startTimestamp
              startingSqrtPriceX96
              marketGroup { # Include parent market group info for context
                id
                address
                chainId
                claimStatement
              }
            }
          }
        }
      `;
      if (chainId) {
        variables.chainId = parseInt(chainId);
      }
      const result = await executeGraphQLQuery(query, variables);

      const marketGroups = result.data?.marketGroups as
        | MarketGroup[]
        | undefined;
      if (marketGroups && Array.isArray(marketGroups)) {
        for (const group of marketGroups) {
          if (group.markets && Array.isArray(group.markets)) {
            allMarkets = [...allMarkets, ...group.markets];
          }
        }
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(allMarkets, null, 2),
        },
      ],
    };
  },
};

// Position Tools
const getPositions = {
  name: 'get_sapience_positions',
  description:
    'Gets information about positions, optionally filtered by chain ID, market address (of market group), or owner',
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'Optional chain ID to filter positions by',
      },
      marketAddress: {
        // This refers to the MarketGroup address in the positions query
        type: 'string',
        description: 'Optional market group address to filter positions by',
      },
      owner: {
        type: 'string',
        description: 'Optional owner address to filter positions by',
      },
    },
    required: [],
  },
  function: async ({
    chainId,
    marketAddress,
    owner,
  }: {
    chainId?: string;
    marketAddress?: string;
    owner?: string;
  }): Promise<ToolResponse> => {
    const query = `
      query GetPositions($chainId: Int, $marketAddress: String, $owner: String) {
        positions(chainId: $chainId, marketAddress: $marketAddress, owner: $owner) {
          id
          positionId
          owner
          baseToken
          quoteToken
          collateral
          borrowedBaseToken
          borrowedQuoteToken
          isLP
          isSettled
          highPriceTick
          lowPriceTick
          lpBaseToken
          lpQuoteToken
          market { # Changed from epoch to market
            id
            marketId
            startTimestamp
            endTimestamp
            settled
            settlementPriceD18
            # Added marketGroup to know which market group this market belongs to
            marketGroup {
                id
                address
                chainId
            }
          }
          transactions {
            id
            type
            timestamp
            transactionHash
          }
        }
      }
    `;

    const variables: Record<string, string | number> = {};
    if (chainId) variables.chainId = parseInt(chainId);
    if (marketAddress) variables.marketAddress = marketAddress;
    if (owner) variables.owner = owner;

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.positions, null, 2),
        },
      ],
    };
  },
};

// Resource Tools
const getResource = {
  name: 'get_sapience_resource',
  description:
    'Gets detailed information about a specific resource by its slug',
  parameters: {
    properties: {
      slug: {
        type: 'string',
        description: 'The slug of the resource to get information about',
      },
    },
    required: ['slug'],
  },
  function: async ({ slug }: { slug: string }): Promise<ToolResponse> => {
    const query = `
      query GetResource($slug: String!) {
        resource(slug: $slug) {
          id
          name
          slug
          marketGroups { # Changed from markets to marketGroups
            address
            chainId
            id
            # Added more fields for context from MarketGroupType
            baseTokenName
            claimStatement
            collateralAsset
            collateralSymbol
            isCumulative
            # isYin removed
            question
            quoteTokenName
          }
          category {
            id
            name
            slug
          }
          resourcePrices { # Added from ResourceType
            id
            timestamp
            value
            blockNumber
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query, { slug });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.resource, null, 2),
        },
      ],
    };
  },
};

const getResources = {
  name: 'get_sapience_resources',
  description: 'Lists all resources available in the Foil system',
  parameters: {
    properties: {}, // No parameters for listResources as per schema
    required: [],
  },
  function: async (): Promise<ToolResponse> => {
    const query = `
      query ListResources {
        resources {
          id
          name
          slug
          marketGroups { # Changed from markets to marketGroups
            address
            chainId
            id
            # Added more fields for context from MarketGroupType
            baseTokenName
            claimStatement
            collateralAsset
            collateralSymbol
            isCumulative
            # isYin removed
            question
            quoteTokenName
          }
          resourcePrices {
            id
            timestamp
            value
            blockNumber
          }
          category { # Added from ResourceType
            id
            name
            slug
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.resources, null, 2),
        },
      ],
    };
  },
};

// Transaction Tools
const getTransactions = {
  name: 'get_sapience_transactions',
  description: 'Gets transaction history, optionally filtered by position ID',
  parameters: {
    properties: {
      positionId: {
        // positionId is Int in schema
        type: 'string', // Keep as string for tool input, parse to Int
        description: 'Optional position ID to filter transactions by',
      },
    },
    required: [],
  },
  function: async ({ positionId }: { positionId?: string }): Promise<ToolResponse> => {
    const query = `
      query GetTransactions($positionId: Int) {
        transactions(positionId: $positionId) {
          id
          type
          timestamp
          transactionHash
          baseToken
          quoteToken
          collateral
          baseTokenDelta
          quoteTokenDelta
          collateralDelta
          tradeRatioD18
          lpBaseDeltaToken # Corrected from lpBaseDeltaToken
          lpQuoteDeltaToken # Corrected from lpQuoteDeltaToken
          position {
            id
            positionId
            owner
            # Added market context to know which market this tx belongs to
            market {
                id
                marketId
                marketGroup {
                    id
                    address
                    chainId
                }
            }
          }
        }
      }
    `;

    const variables: Record<string, number> = {};
    if (positionId) variables.positionId = parseInt(positionId);

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.transactions, null, 2),
        },
      ],
    };
  },
};

// Helper function to convert interval string to seconds
function intervalToSeconds(interval: string): number {
  if (!isNaN(Number(interval))) {
    return Number(interval);
  }

  const match = interval.match(/^(\d+)(s|m|h|d|w)$/);
  if (!match) {
    throw new Error(
      'Invalid interval format. Use a number for seconds or format like "1d", "4h", "30m", "45s", "1w"'
    );
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };

  return value * multipliers[unit];
}

const getMarketCandles = {
  name: 'get_sapience_market_candles',
  description:
    'Gets price candle data (OHLC) for a specific market over a time period. To, from, and interval should be specified in seconds.',
  parameters: {
    properties: {
      address: {
        // This is market group address
        type: 'string',
        description: 'The address of the market group',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market group exists',
      },
      marketId: {
        // Changed from epochId to marketId
        type: 'string',
        description: 'The market ID (epoch ID) to get candles for',
      },
      from: {
        type: 'string',
        description: 'Start timestamp in seconds',
      },
      to: {
        type: 'string',
        description: 'End timestamp in seconds',
      },
      interval: {
        type: 'string',
        description: 'Interval between candles in seconds',
      },
    },
    required: ['address', 'chainId', 'marketId', 'from', 'to', 'interval'],
  },
  function: async ({
    address,
    chainId,
    marketId,
    from,
    to,
    interval,
  }: {
    address: string;
    chainId: string;
    marketId: string; // Changed from epochId
    from: string;
    to: string;
    interval: string;
  }): Promise<ToolResponse> => {
    const intervalSeconds = intervalToSeconds(interval);

    const query = `
      query GetMarketCandles($address: String!, $chainId: Int!, $marketId: String!, $from: Int!, $to: Int!, $interval: Int!) {
        marketCandles(address: $address, chainId: $chainId, marketId: $marketId, from: $from, to: $to, interval: $interval) {
          timestamp
          open
          high
          low
          close
        }
      }
    `;

    const result = await executeGraphQLQuery(query, {
      address,
      chainId: parseInt(chainId),
      marketId, // Changed from epochId
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.marketCandles, null, 2),
        },
      ],
    };
  },
};

const getResourceCandles = {
  name: 'get_sapience_resource_candles',
  description:
    'Gets price candle data (OHLC) for a specific resource over a time period. To, from, and interval should be specified in seconds.',
  parameters: {
    properties: {
      slug: {
        type: 'string',
        description: 'The slug of the resource',
      },
      from: {
        type: 'string',
        description: 'Start timestamp in seconds',
      },
      to: {
        type: 'string',
        description: 'End timestamp in seconds',
      },
      interval: {
        type: 'string',
        description: 'Interval between candles in seconds',
      },
    },
    required: ['slug', 'from', 'to', 'interval'],
  },
  function: async ({
    slug,
    from,
    to,
    interval,
  }: {
    slug: string;
    from: string;
    to: string;
    interval: string;
  }): Promise<ToolResponse> => {
    const intervalSeconds = intervalToSeconds(interval);

    const query = `
      query GetResourceCandles($slug: String!, $from: Int!, $to: Int!, $interval: Int!) {
        resourceCandles(slug: $slug, from: $from, to: $to, interval: $interval) {
          timestamp
          open
          high
          low
          close
        }
      }
    `;

    const result = await executeGraphQLQuery(query, {
      slug,
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.resourceCandles, null, 2),
        },
      ],
    };
  },
};

const getResourceTrailingAverageCandles = {
  name: 'get_sapience_resource_trailing_average_candles',
  description:
    'Gets trailing average price candle data (OHLC) for a specific resource over a time period. To, from, interval, and trailingAvgTime should be specified in seconds.',
  parameters: {
    properties: {
      slug: {
        type: 'string',
        description: 'The slug of the resource',
      },
      from: {
        type: 'string',
        description: 'Start timestamp in seconds',
      },
      to: {
        type: 'string',
        description: 'End timestamp in seconds',
      },
      interval: {
        type: 'string',
        description: 'Interval between candles in seconds',
      },
      trailingAvgTime: {
        type: 'string',
        description: 'Time window for trailing average in seconds',
      },
    },
    required: ['slug', 'from', 'to', 'interval', 'trailingAvgTime'],
  },
  function: async ({
    slug,
    from,
    to,
    interval,
    trailingAvgTime,
  }: {
    slug: string;
    from: string;
    to: string;
    interval: string;
    trailingAvgTime: string;
  }): Promise<ToolResponse> => {
    const intervalSeconds = intervalToSeconds(interval);
    const trailingAvgSeconds = intervalToSeconds(trailingAvgTime);

    const query = `
      query GetResourceTrailingAverageCandles($slug: String!, $from: Int!, $to: Int!, $interval: Int!, $trailingAvgTime: Int!) {
        resourceTrailingAverageCandles(slug: $slug, from: $from, to: $to, interval: $interval, trailingAvgTime: $trailingAvgTime) {
          timestamp
          open
          high
          low
          close
        }
      }
    `;

    const result = await executeGraphQLQuery(query, {
      slug,
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
      trailingAvgTime: trailingAvgSeconds,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            result.data?.resourceTrailingAverageCandles,
            null,
            2
          ),
        },
      ],
    };
  },
};

const getIndexCandles = {
  name: 'get_sapience_index_candles',
  description:
    'Gets index price candle data (OHLC) for a specific market over a time period. To, from, and interval should be specified in seconds.',
  parameters: {
    properties: {
      address: {
        // This is market group address
        type: 'string',
        description: 'The address of the market group',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market group exists',
      },
      marketId: {
        // Changed from epochId to marketId
        type: 'string',
        description: 'The market ID (epoch ID) to get candles for',
      },
      from: {
        type: 'string',
        description: 'Start timestamp in seconds',
      },
      to: {
        type: 'string',
        description: 'End timestamp in seconds',
      },
      interval: {
        type: 'string',
        description: 'Interval between candles in seconds',
      },
    },
    required: ['address', 'chainId', 'marketId', 'from', 'to', 'interval'],
  },
  function: async ({
    address,
    chainId,
    marketId,
    from,
    to,
    interval,
  }: {
    address: string;
    chainId: string;
    marketId: string; // Changed from epochId
    from: string;
    to: string;
    interval: string;
  }): Promise<ToolResponse> => {
    const intervalSeconds = intervalToSeconds(interval);

    const query = `
      query GetIndexCandles($address: String!, $chainId: Int!, $marketId: String!, $from: Int!, $to: Int!, $interval: Int!) {
        indexCandles(address: $address, chainId: $chainId, marketId: $marketId, from: $from, to: $to, interval: $interval) {
          timestamp
          open
          high
          low
          close
        }
      }
    `;

    const result = await executeGraphQLQuery(query, {
      address,
      chainId: parseInt(chainId),
      marketId, // Changed from epochId
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result.data?.indexCandles, null, 2),
        },
      ],
    };
  },
};

export {
  getMarketGroup,
  getMarket,
  getMarketGroups,
  getMarkets,
  getPositions,
  getResource,
  getResources,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles,
};
