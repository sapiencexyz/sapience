import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import FoilABI from '@foil/protocol/deployments/Foil.json';

// Create a public client for interacting with the blockchain
const client = createPublicClient({
  chain: base,
  transport: process.env.TRANSPORT_URL
    ? http(process.env.TRANSPORT_URL)
    : http(),
});

// Helper function to encode function data
function encodeFunction(
  functionName: string,
  args: (string | number | bigint | boolean)[]
) {
  return encodeFunctionData({
    abi: FoilABI.abi,
    functionName,
    args,
  });
}

export const quoteCreateTraderPosition = {
  name: 'quote_create_sapience_trader_position',
  description: 'Gets a quote for creating a new trader position',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description:
          'The address of the market group to create the position in',
      },
      marketId: {
        type: 'string',
        description: 'The market ID to create the position in',
      },
      collateralAmount: {
        type: 'string',
        description: 'The amount of collateral to use',
      },
      size: {
        type: 'string',
        description: 'The size of the position',
      },
    },
    required: ['marketGroupAddress', 'marketId', 'collateralAmount', 'size'],
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
    collateralAmount: string;
    size: string;
  }) => {
    try {
      const result = await client.simulateContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'quoteCreateTraderPosition',
        args: [BigInt(args.marketId), Number(args.size)],
      });

      const [requiredCollateral, fillPrice] = result.result as [bigint, bigint];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                requiredCollateral: requiredCollateral.toString(),
                fillPrice: fillPrice.toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error getting quote for createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const createTraderPosition = {
  name: 'create_sapience_trader_position',
  description: 'Creates a new trader position with specified parameters',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description:
          'The address of the market group to create the position in',
      },
      marketId: {
        type: 'string',
        description: 'The market ID to create the position in',
      },
      collateralAmount: {
        type: 'string',
        description: 'The amount of collateral to use',
      },
      size: {
        type: 'string',
        description: 'The size of the position',
      },
      deadline: {
        type: 'string',
        description: 'The deadline for the transaction (timestamp in seconds)',
      },
    },
    required: [
      'marketGroupAddress',
      'marketId',
      'collateralAmount',
      'size',
      'deadline',
    ],
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
    collateralAmount: string;
    size: string;
    deadline: string;
  }) => {
    try {
      const calldata = encodeFunction('createTraderPosition', [
        BigInt(args.marketId),
        BigInt(args.size),
        BigInt(args.collateralAmount),
        BigInt(args.deadline),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const quoteModifyTraderPosition = {
  name: 'quote_modify_sapience_trader_position',
  description: 'Gets a quote for modifying an existing trader position',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description: 'The address of the market group',
      },
      positionId: {
        type: 'string',
        description: 'The ID of the position to modify',
      },
      newCollateralAmount: {
        type: 'string',
        description: 'The new amount of collateral to use',
      },
      newSize: {
        type: 'string',
        description: 'The new size of the position',
      },
    },
    required: [
      'marketGroupAddress',
      'positionId',
      'newCollateralAmount',
      'newSize',
    ],
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    newCollateralAmount: string;
    newSize: string;
  }) => {
    try {
      const result = await client.simulateContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'quoteModifyTraderPosition',
        args: [BigInt(args.positionId), Number(args.newSize)],
      });

      const [expectedCollateralDelta, closePnL, fillPrice] = result.result as [
        bigint,
        bigint,
        bigint,
      ];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                expectedCollateralDelta: expectedCollateralDelta.toString(),
                closePnL: closePnL.toString(),
                fillPrice: fillPrice.toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error getting quote for modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const modifyTraderPosition = {
  name: 'modify_sapience_trader_position',
  description: 'Modifies an existing trader position with new parameters',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description: 'The address of the market group',
      },
      positionId: {
        type: 'string',
        description: 'The ID of the position to modify',
      },
      newSize: {
        type: 'string',
        description: 'The new size of the position',
      },
      deltaCollateralLimit: {
        type: 'string',
        description:
          'The change in the collateral limit. Positive for adding collateral, negative for removing. If 0, no limit.',
      },
      deadline: {
        type: 'string',
        description: 'The deadline for the transaction (timestamp in seconds)',
      },
    },
    required: [
      'marketGroupAddress',
      'positionId',
      'newSize',
      'deltaCollateralLimit',
      'deadline',
    ],
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    newSize: string;
    deltaCollateralLimit: string;
    deadline: string;
  }) => {
    try {
      const calldata = encodeFunction('modifyTraderPosition', [
        BigInt(args.positionId),
        BigInt(args.newSize),
        BigInt(args.deltaCollateralLimit),
        BigInt(args.deadline),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const quoteLiquidityPosition = {
  name: 'quote_create_sapience_liquidity_position',
  description: 'Gets a quote for creating a new liquidity position',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description:
          'The address of the market group to create the position in',
      },
      marketId: {
        type: 'string',
        description: 'The market ID to create the position in',
      },
      collateralAmount: {
        type: 'string',
        description: 'The amount of collateral to use',
      },
      size: {
        type: 'string',
        description: 'The size of the position',
      },
    },
    required: ['marketGroupAddress', 'marketId', 'collateralAmount', 'size'],
  },
  function: async (args: {
    marketGroupAddress: string;
    marketId: string;
    collateralAmount: string;
    size: string;
  }) => {
    try {
      const result = await client.simulateContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'quoteLiquidityPositionTokens',
        args: [
          BigInt(args.marketId),
          BigInt(args.collateralAmount),
          Number(args.size),
        ],
      });

      const [amount0, amount1, liquidity] = result.result as [
        bigint,
        bigint,
        bigint,
      ];

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                amount0: amount0.toString(),
                amount1: amount1.toString(),
                liquidity: liquidity.toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error getting quote for liquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const createLiquidityPosition = {
  name: 'create_sapience_liquidity_position',
  description: 'Creates a new liquidity position with specified parameters',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description:
          'The address of the market group to create the position in',
      },
      collateralAmount: {
        type: 'string',
        description: 'The amount of collateral to use',
      },
      size: {
        type: 'string',
        description: 'The size of the position',
      },
    },
    required: ['marketGroupAddress', 'collateralAmount', 'size'],
  },
  function: async (args: {
    marketGroupAddress: string;
    collateralAmount: string;
    size: string;
  }) => {
    try {
      const calldata = encodeFunction('createLiquidityPosition', [
        BigInt(args.collateralAmount),
        Number(args.size),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding createLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const quoteModifyLiquidityPosition = {
  name: 'quote_modify_sapience_liquidity_position',
  description: 'Gets a quote for modifying an existing liquidity position',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description: 'The address of the market group',
      },
      positionId: {
        type: 'string',
        description: 'The ID of the position to modify',
      },
      newCollateralAmount: {
        type: 'string',
        description: 'The new amount of collateral to use',
      },
      newSize: {
        type: 'string',
        description: 'The new size of the position',
      },
    },
    required: [
      'marketGroupAddress',
      'positionId',
      'newCollateralAmount',
      'newSize',
    ],
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    newCollateralAmount: string;
    newSize: string;
  }) => {
    try {
      const result = await client.simulateContract({
        address: args.marketGroupAddress as `0x${string}`,
        abi: FoilABI.abi,
        functionName: 'quoteRequiredCollateral',
        args: [BigInt(args.positionId), Number(args.newSize)],
      });

      const requiredCollateral = result.result as bigint;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                requiredCollateral: requiredCollateral.toString(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error getting quote for modifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const modifyLiquidityPosition = {
  name: 'modify_sapience_liquidity_position',
  description: 'Modifies an existing liquidity position with new parameters',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description: 'The address of the market group',
      },
      positionId: {
        type: 'string',
        description: 'The ID of the position to modify',
      },
      newCollateralAmount: {
        type: 'string',
        description: 'The new amount of collateral to use',
      },
      newSize: {
        type: 'string',
        description: 'The new size of the position',
      },
    },
    required: [
      'marketGroupAddress',
      'positionId',
      'newCollateralAmount',
      'newSize',
    ],
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
    newCollateralAmount: string;
    newSize: string;
  }) => {
    try {
      const calldata = encodeFunction('modifyLiquidityPosition', [
        BigInt(args.positionId),
        BigInt(args.newCollateralAmount),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding modifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};

export const settlePosition = {
  name: 'settle_sapience_position',
  description:
    'Settles a position, closing it and returning any remaining collateral, after the market has ended and settled',
  parameters: {
    properties: {
      marketGroupAddress: {
        type: 'string',
        description: 'The address of the market group',
      },
      positionId: {
        type: 'string',
        description: 'The ID of the position to settle',
      },
    },
    required: ['marketGroupAddress', 'positionId'],
  },
  function: async (args: {
    marketGroupAddress: string;
    positionId: string;
  }) => {
    try {
      const calldata = encodeFunction('settlePosition', [
        BigInt(args.positionId),
      ]);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                to: args.marketGroupAddress,
                data: calldata,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error encoding settlePosition: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
};
