import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import FoilABI from '../Foil.json';

// Create a public client for interacting with the blockchain
const client = createPublicClient({
  chain: base,
  transport: http()
});

// Helper function to encode function data
function encodeFunction(functionName: string, args: any[]) {
  return encodeFunctionData({
    abi: FoilABI.abi,
    functionName,
    args
  });
}

export const quoteCreateTraderPosition = {
  name: "quote_create_foil_trader_position",
  description: "Gets a quote for creating a new trader position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to create the position in"
      },
      collateralAmount: {
        type: "string",
        description: "The amount of collateral to use"
      },
      size: {
        type: "string",
        description: "The size of the position"
      }
    },
    required: ["marketAddress", "collateralAmount", "size"],
  },
  function: async (args: { marketAddress: string; collateralAmount: string; size: string }) => {
    try {
      const calldata = encodeFunction('quoteCreateTraderPosition', [
        BigInt(args.collateralAmount),
        Number(args.size)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteCreateTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const createTraderPosition = {
  name: "create_foil_trader_position",
  description: "Creates a new trader position with specified parameters",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to create the position in"
      },
      collateralAmount: {
        type: "string",
        description: "The amount of collateral to use"
      },
      size: {
        type: "string",
        description: "The size of the position"
      }
    },
    required: ["marketAddress", "collateralAmount", "size"],
  },
  function: async (args: { marketAddress: string; collateralAmount: string; size: string }) => {
    try {
      const calldata = encodeFunction('createTraderPosition', [
        BigInt(args.collateralAmount),
        Number(args.size)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding createTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const quoteModifyTraderPosition = {
  name: "quote_modify_foil_trader_position",
  description: "Gets a quote for modifying an existing trader position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to modify"
      },
      newCollateralAmount: {
        type: "string",
        description: "The new amount of collateral to use"
      },
      newSize: {
        type: "string",
        description: "The new size of the position"
      }
    },
    required: ["marketAddress", "positionId", "newCollateralAmount", "newSize"],
  },
  function: async (args: { marketAddress: string; positionId: string; newCollateralAmount: string; newSize: string }) => {
    try {
      const calldata = encodeFunction('quoteModifyTraderPosition', [
        BigInt(args.positionId),
        BigInt(args.newCollateralAmount)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteModifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const modifyTraderPosition = {
  name: "modify_foil_trader_position",
  description: "Modifies an existing trader position with new parameters",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to modify"
      },
      newCollateralAmount: {
        type: "string",
        description: "The new amount of collateral to use"
      },
      newSize: {
        type: "string",
        description: "The new size of the position"
      }
    },
    required: ["marketAddress", "positionId", "newCollateralAmount", "newSize"],
  },
  function: async (args: { marketAddress: string; positionId: string; newCollateralAmount: string; newSize: string }) => {
    try {
      const calldata = encodeFunction('modifyTraderPosition', [
        BigInt(args.positionId),
        BigInt(args.newCollateralAmount)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding modifyTraderPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const quoteLiquidityPosition = {
  name: "quote_create_foil_liquidity_position",
  description: "Gets a quote for creating a new liquidity position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to create the position in"
      },
      collateralAmount: {
        type: "string",
        description: "The amount of collateral to use"
      },
      size: {
        type: "string",
        description: "The size of the position"
      }
    },
    required: ["marketAddress", "collateralAmount", "size"],
  },
  function: async (args: { marketAddress: string; collateralAmount: string; size: string }) => {
    try {
      const calldata = encodeFunction('quoteLiquidityPosition', [
        BigInt(args.collateralAmount),
        Number(args.size)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const createLiquidityPosition = {
  name: "create_foil_liquidity_position",
  description: "Creates a new liquidity position with specified parameters",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market to create the position in"
      },
      collateralAmount: {
        type: "string",
        description: "The amount of collateral to use"
      },
      size: {
        type: "string",
        description: "The size of the position"
      }
    },
    required: ["marketAddress", "collateralAmount", "size"],
  },
  function: async (args: { marketAddress: string; collateralAmount: string; size: string }) => {
    try {
      const calldata = encodeFunction('createLiquidityPosition', [
        BigInt(args.collateralAmount),
        Number(args.size)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding createLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const quoteModifyLiquidityPosition = {
  name: "quote_modify_foil_liquidity_position",
  description: "Gets a quote for modifying an existing liquidity position",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to modify"
      },
      newCollateralAmount: {
        type: "string",
        description: "The new amount of collateral to use"
      },
      newSize: {
        type: "string",
        description: "The new size of the position"
      }
    },
    required: ["marketAddress", "positionId", "newCollateralAmount", "newSize"],
  },
  function: async (args: { marketAddress: string; positionId: string; newCollateralAmount: string; newSize: string }) => {
    try {
      const calldata = encodeFunction('quoteModifyLiquidityPosition', [
        BigInt(args.positionId),
        BigInt(args.newCollateralAmount)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding quoteModifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const modifyLiquidityPosition = {
  name: "modify_foil_liquidity_position",
  description: "Modifies an existing liquidity position with new parameters",
  parameters: {
    properties: {
      marketAddress: {
        type: "string",
        description: "The address of the market"
      },
      positionId: {
        type: "string",
        description: "The ID of the position to modify"
      },
      newCollateralAmount: {
        type: "string",
        description: "The new amount of collateral to use"
      },
      newSize: {
        type: "string",
        description: "The new size of the position"
      }
    },
    required: ["marketAddress", "positionId", "newCollateralAmount", "newSize"],
  },
  function: async (args: { marketAddress: string; positionId: string; newCollateralAmount: string; newSize: string }) => {
    try {
      const calldata = encodeFunction('modifyLiquidityPosition', [
        BigInt(args.positionId),
        BigInt(args.newCollateralAmount)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.marketAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding modifyLiquidityPosition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
}; 