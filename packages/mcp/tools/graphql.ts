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

const introspectSchema = {
  parameters: {
    properties: {},
    required: [],
  },
  function: async () => {
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            ...FullType
          }
          directives {
            name
            description
            locations
            args {
              ...InputValue
            }
          }
        }
      }
      fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            ...InputValue
          }
          type {
            ...TypeRef
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          ...InputValue
        }
        interfaces {
          ...TypeRef
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          ...TypeRef
        }
      }
      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }
      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    `;

    const result = await executeGraphQLQuery(introspectionQuery);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  },
};

const executeQuery = {
  parameters: {
    properties: {
      query: {
        type: 'string',
        description: 'The GraphQL query to execute',
      },
      variables: {
        type: 'string',
        description: 'Optional JSON string of variables for the query',
      },
    },
    required: ['query'],
  },
  function: async ({ query, variables }: { query: string; variables?: string }) => {
    try {
      // Validate the query syntax
      parse(query);
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Invalid GraphQL query: ${error}`,
        }],
      };
    }

    let parsedVariables: Record<string, any> | undefined;
    if (variables) {
      try {
        parsedVariables = JSON.parse(variables);
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Invalid variables JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }],
        };
      }
    }

    try {
      const result = await executeGraphQLQuery(query, parsedVariables);
      
      if (result.errors && result.errors.length > 0) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`,
          }],
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result.data, null, 2),
        }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Failed to execute GraphQL query: ${error}`,
        }],
      };
    }
  },
};

// Market Tools
const getMarket = {
  parameters: {
    properties: {
      address: {
        type: 'string',
        description: 'The market address',
      },
      chainId: {
        type: 'string',
        description: 'The chain ID',
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
  parameters: {
    properties: {
      chainId: {
        type: 'string',
        description: 'Optional chain ID filter',
      },
      marketAddress: {
        type: 'string',
        description: 'Optional market address filter',
      },
      owner: {
        type: 'string',
        description: 'Optional owner address filter',
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
  parameters: {
    properties: {
      slug: {
        type: 'string',
        description: 'The resource slug',
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
          resourcePrices {
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
      content: [{
        type: "text" as const,
        text: JSON.stringify(result.data?.resource, null, 2)
      }]
    };
  },
};

const listResources = {
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
  parameters: {
    properties: {
      marketId: {
        type: 'string',
        description: 'Optional market ID filter',
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
  parameters: {
    properties: {
      positionId: {
        type: 'string',
        description: 'Optional position ID filter',
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

export {
  introspectSchema,
  executeQuery,
  getMarket,
  listMarkets,
  getPositions,
  getResource,
  listResources,
  getEpochs,
  getTransactions
};
