'use strict';

const SAPIENCE_API_BASE_URL = process.env.SAPIENCE_API_URL || 'https://api.sapience.xyz';
const SAPIENCE_GRAPHQL_ENDPOINT = `${SAPIENCE_API_BASE_URL}/graphql`;

interface GraphQLResponse {
  data?: any;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

async function executeGraphQLQuery(query: string, variables?: Record<string, any>): Promise<GraphQLResponse> {
  const response = await fetch(SAPIENCE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text(); // Try to get the response body for more details
    } catch (e) {
      // Ignore error if reading body fails
    }
    // Include status, statusText, and the body in the error
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}. Response body: ${errorBody}`);
  }

  return response.json();
}

// Market Group Tools
const getMarketGroup = {
  name: "get_sapience_market_group",
  description: "Gets detailed information about a specific market group by its address and chain ID",
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
  function: async ({ address, chainId }: { address: string; chainId: string }) => {
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
          isYin
          owner
          vaultAddress
          collateralDecimals
          markets {
            marketId
            startTimestamp
            endTimestamp
            settled
            settlementPriceD18
          }
          resource {
            id
            name
            slug
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query, { address, chainId: parseInt(chainId) });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.marketGroup, null, 2)
      }]
    };
  },
};

const listMarketGroups = {
  name: "list_sapience_market_groups",
  description: "Lists all market groups available in the Foil system, optionally filtering for groups with currently active markets (end time in the future).",
  parameters: {
    properties: {
      activeOnly: {
        type: 'boolean',
        description: 'Optional boolean to filter for market groups with active markets (end time in the future). Defaults to false if not provided.',
      },
    },
    required: [], // activeOnly is optional
  },
  function: async ({ activeOnly }: { activeOnly?: boolean }) => {
    // Query for market groups and their associated markets
    const query = `
      query ListMarketGroups {
        marketGroups {
          address
          chainId
          collateralAsset
          deployTimestamp
          deployTxnBlockNumber
          id
          isCumulative
          isYin
          owner
          vaultAddress
          collateralDecimals
          resource {
            id
            name
            slug
          }
          markets {
            marketId
            startTimestamp
            endTimestamp
            settled
            public
            question
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query);
    let groups = result.data?.marketGroups || [];

    if (activeOnly) {
      const nowInSeconds = Date.now() / 1000;
      groups = groups.filter((group: any) =>
        group.markets.some((market: any) => market.endTimestamp > nowInSeconds && market.public)
      );
    } else {
        // If not filtering by active, still filter out groups that have no public markets at all
        groups = groups.filter((group: any) => group.markets.some((market: any) => market.public));
    }

    // Optionally simplify the output, maybe remove the markets array from the top level group object if it's too verbose
    const formattedGroups = groups.map((group: any) => {
      // Example: return only essential group info, or keep it as is
      // const { markets, ...restOfGroup } = group; // Remove markets if desired
      // return restOfGroup;
      return group; // Keep full group info including markets for now
    });


    return {
      content: [{
        type: "text" as const,
        // text: JSON.stringify(formattedMarkets, null, 2) // Old return
        text: JSON.stringify(formattedGroups, null, 2) // Return filtered groups
      }]
    };
  },
};

// Position Tools
const getPositions = {
  name: "get_sapience_positions",
  description: "Gets information about positions, optionally filtered by chain ID, market group address, or owner",
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'Optional chain ID to filter positions by',
      },
      marketGroupAddress: {
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
  function: async ({ chainId, marketGroupAddress, owner }: { chainId?: string; marketGroupAddress?: string; owner?: string }) => {
    const query = `
      query GetPositions($chainId: Int, $marketGroupAddress: String, $owner: String) {
        positions(chainId: $chainId, marketGroupAddress: $marketGroupAddress, owner: $owner) {
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
          marketGroup: market {
            marketGroupId: marketId
            startTimestamp
            endTimestamp
            settled
            settlementPriceD18
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

    const variables: Record<string, any> = {};
    if (chainId) variables.chainId = parseInt(chainId);
    if (marketGroupAddress) variables.marketGroupAddress = marketGroupAddress;
    if (owner) variables.owner = owner;

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.positions, null, 2)
      }]
    };
  },
};

// Resource Tools
const getResource = {
  name: "get_sapience_resource",
  description: "Gets detailed information about a specific resource by its slug",
  parameters: {
    properties: {
      slug: {
        type: 'string',
        description: 'The slug of the resource to get information about',
      },
    },
    required: ['slug'],
  },
  function: async ({ slug }: { slug: string }) => {
    const query = `
      query GetResource($slug: String!) {
        resource(slug: $slug) {
          id
          name
          slug
          marketGroups: markets {
            address
            chainId
            id
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query, { slug });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.resource, null, 2)
      }]
    };
  },
};

const listResources = {
  name: "list_sapience_resources",
  description: "Lists all resources available in the Foil system",
  parameters: {
    properties: {},
    required: [],
  },
  function: async () => {
    const query = `
      query ListResources {
        resources {
          id
          name
          slug
          marketGroups: markets {
            address
            chainId
            id
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(query);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.resources, null, 2)
      }]
    };
  },
};

// Market Tools (previously Epoch Tools)
const listMarketsForGroup = {
  name: "list_sapience_markets_for_group",
  description: "Gets information about markets (periods) associated with a specific market group",
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The address of the market group',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market group exists',
      }
    },
    required: ['address', 'chainId'],
  },
  function: async ({ address, chainId }: { address: string, chainId: string }) => {
    // Fetch the specific market group and its markets
    const query = `
      query GetMarketGroupWithMarkets($address: String!, $chainId: Int!) {
        marketGroup(address: $address, chainId: $chainId) {
          address
          chainId
          markets {
            id
            marketId
            startTimestamp
            endTimestamp
            settled
            settlementPriceD18
            public
            question
            poolAddress
            positions { # Include positions if needed, or remove for brevity
              id
              positionId
              owner
            }
          }
        }
      }
    `;

    const variables: Record<string, any> = { address, chainId: parseInt(chainId) };

    const result = await executeGraphQLQuery(query, variables);
    const markets = result.data?.marketGroup?.markets || [];

    // Filter for public markets only
    const publicMarkets = markets.filter((market: any) => market.public);


    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(publicMarkets, null, 2) // Return the markets array
      }]
    };
  },
};

// Transaction Tools
const getTransactions = {
  name: "get_sapience_transactions",
  description: "Gets transaction history, optionally filtered by position ID",
  parameters: {
    properties: {
      positionId: {
        type: 'string',
        description: 'Optional position ID to filter transactions by',
      },
    },
    required: [],
  },
  function: async ({ positionId }: { positionId?: string }) => {
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
          lpBaseDeltaToken
          lpQuoteDeltaToken
          position {
            id
            positionId
            owner
          }
        }
      }
    `;

    const variables: Record<string, any> = {};
    if (positionId) variables.positionId = parseInt(positionId);

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.transactions, null, 2)
      }]
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
    throw new Error('Invalid interval format. Use a number for seconds or format like "1d", "4h", "30m", "45s", "1w"');
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    's': 1,
    'm': 60,
    'h': 3600,
    'd': 86400,
    'w': 604800
  };

  return value * multipliers[unit];
}

const getMarketCandles = {
  name: "get_sapience_market_group_candles",
  description: "Gets price candle data (OHLC) for a specific market within a market group over a time period. To, from, and interval should be specified in seconds.",
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
      marketId: {
        type: 'string',
        description: 'The market ID to get candles for',
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
  function: async ({ address, chainId, marketId, from, to, interval }: { 
    address: string; 
    chainId: string; 
    marketId: string;
    from: string;
    to: string;
    interval: string;
  }) => {
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
      marketId,
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
    });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.marketCandles, null, 2)
      }]
    };
  },
};

const getResourceCandles = {
  name: "get_sapience_resource_candles",
  description: "Gets price candle data (OHLC) for a specific resource over a time period. To, from, and interval should be specified in seconds.",
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
  function: async ({ slug, from, to, interval }: { 
    slug: string; 
    from: string;
    to: string;
    interval: string;
  }) => {
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
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.resourceCandles, null, 2)
      }]
    };
  },
};

const getResourceTrailingAverageCandles = {
  name: "get_sapience_resource_trailing_average_candles",
  description: "Gets trailing average price candle data (OHLC) for a specific resource over a time period. To, from, interval, and trailingAvgTime should be specified in seconds.",
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
  function: async ({ slug, from, to, interval, trailingAvgTime }: { 
    slug: string; 
    from: string;
    to: string;
    interval: string;
    trailingAvgTime: string;
  }) => {
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
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.resourceTrailingAverageCandles, null, 2)
      }]
    };
  },
};

const getIndexCandles = {
  name: "get_sapience_index_candles",
  description: "Gets index price candle data (OHLC) for a specific market group over a time period. To, from, and interval should be specified in seconds.",
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
      marketId: {
        type: 'string',
        description: 'The market ID to get candles for',
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
  function: async ({ address, chainId, marketId, from, to, interval }: { 
    address: string; 
    chainId: string; 
    marketId: string;
    from: string;
    to: string;
    interval: string;
  }) => {
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
      marketId,
      from: parseInt(from),
      to: parseInt(to),
      interval: intervalSeconds,
    });
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.indexCandles, null, 2)
      }]
    };
  },
};

export {
  getMarketGroup,
  listMarketGroups,
  getPositions,
  getResource,
  listResources,
  listMarketsForGroup,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles
};
