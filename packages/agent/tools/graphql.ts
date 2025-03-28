import { z } from 'zod';
import { parse } from 'graphql/language';

const FOIL_GRAPHQL_ENDPOINT = 'https://api.foil.xyz/graphql';

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
  const response = await fetch(FOIL_GRAPHQL_ENDPOINT, {
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
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  return response.json();
}

// Market Tools
const getMarket = {
  name: "get_foil_market",
  description: "Gets detailed information about a specific market by its address and chain ID",
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The address of the market',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market exists',
      },
    },
    required: ['address', 'chainId'],
  },
  function: async ({ address, chainId }: { address: string; chainId: string }) => {
    const query = `
      query GetMarket($address: String!, $chainId: Int!) {
        market(address: $address, chainId: $chainId) {
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
          epochs {
            epochId
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
        text: JSON.stringify(result.data?.market, null, 2)
      }]
    };
  },
};

const listMarkets = {
  name: "list_foil_markets",
  description: "Lists all markets available in the Foil system",
  parameters: {
    properties: {},
    required: [],
  },
  function: async () => {
    const query = `
      query ListMarkets {
        markets {
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
          epochs {
            epochId
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

    const result = await executeGraphQLQuery(query);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.markets, null, 2)
      }]
    };
  },
};

// Position Tools
const getPositions = {
  name: "get_foil_positions",
  description: "Gets information about positions, optionally filtered by chain ID, market address, or owner",
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'Optional chain ID to filter positions by',
      },
      marketAddress: {
        type: 'string',
        description: 'Optional market address to filter positions by',
      },
      owner: {
        type: 'string',
        description: 'Optional owner address to filter positions by',
      },
    },
    required: [],
  },
  function: async ({ chainId, marketAddress, owner }: { chainId?: string; marketAddress?: string; owner?: string }) => {
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
          epoch {
            epochId
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
    if (marketAddress) variables.marketAddress = marketAddress;
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
  name: "get_foil_resource",
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
          markets {
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
  name: "list_foil_resources",
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
          markets {
            address
            chainId
            id
          }
          resourcePrices {
            id
            timestamp
            value
            blockNumber
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

// Period Tools (previously Epoch Tools)
const getEpochs = {
  name: "get_foil_periods",
  description: "Gets information about epochs (periods) in the system, optionally filtered by market ID",
  parameters: {
    properties: {
      marketId: {
        type: 'string',
        description: 'Optional market ID to filter epochs by',
      },
    },
    required: [],
  },
  function: async ({ marketId }: { marketId?: string }) => {
    const query = `
      query GetEpochs($marketId: Int) {
        epochs(marketId: $marketId) {
          id
          epochId
          startTimestamp
          endTimestamp
          settled
          settlementPriceD18
          public
          market {
            address
            chainId
            id
          }
          positions {
            id
            positionId
            owner
          }
        }
      }
    `;

    const variables: Record<string, any> = {};
    if (marketId) variables.marketId = parseInt(marketId);

    const result = await executeGraphQLQuery(query, variables);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.epochs, null, 2)
      }]
    };
  },
};

// Transaction Tools
const getTransactions = {
  name: "get_foil_transactions",
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
  name: "get_foil_market_candles",
  description: "Gets price candle data (OHLC) for a specific market over a time period. To, from, and interval should be specified in seconds.",
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The address of the market',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market exists',
      },
      epochId: {
        type: 'string',
        description: 'The epoch ID to get candles for',
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
    required: ['address', 'chainId', 'epochId', 'from', 'to', 'interval'],
  },
  function: async ({ address, chainId, epochId, from, to, interval }: { 
    address: string; 
    chainId: string; 
    epochId: string;
    from: string;
    to: string;
    interval: string;
  }) => {
    const intervalSeconds = intervalToSeconds(interval);
    
    const query = `
      query GetMarketCandles($address: String!, $chainId: Int!, $epochId: String!, $from: Int!, $to: Int!, $interval: Int!) {
        marketCandles(address: $address, chainId: $chainId, epochId: $epochId, from: $from, to: $to, interval: $interval) {
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
      epochId,
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
  name: "get_foil_resource_candles",
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
  name: "get_foil_resource_trailing_average_candles",
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
  name: "get_foil_index_candles",
  description: "Gets index price candle data (OHLC) for a specific market over a time period. To, from, and interval should be specified in seconds.",
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The address of the market',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID where the market exists',
      },
      epochId: {
        type: 'string',
        description: 'The epoch ID to get candles for',
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
    required: ['address', 'chainId', 'epochId', 'from', 'to', 'interval'],
  },
  function: async ({ address, chainId, epochId, from, to, interval }: { 
    address: string; 
    chainId: string; 
    epochId: string;
    from: string;
    to: string;
    interval: string;
  }) => {
    const intervalSeconds = intervalToSeconds(interval);

    const query = `
      query GetIndexCandles($address: String!, $chainId: Int!, $epochId: String!, $from: Int!, $to: Int!, $interval: Int!) {
        indexCandles(address: $address, chainId: $chainId, epochId: $epochId, from: $from, to: $to, interval: $interval) {
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
      epochId,
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
  getMarket,
  listMarkets,
  getPositions,
  getResource,
  listResources,
  getEpochs,
  getTransactions,
  getMarketCandles,
  getResourceCandles,
  getResourceTrailingAverageCandles,
  getIndexCandles
};
