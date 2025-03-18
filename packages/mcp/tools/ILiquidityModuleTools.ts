// MCP Tool for ILiquidityModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import ILiquidityModuleABI from '../out/ILiquidityModule.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const ILiquidityModuleTools = {
  createLiquidityPosition: {
    description: "Call createLiquidityPosition function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        params: {
          type: "any",
        },
      },
      required: ["contractAddress", "params"]
    },
    function: async ({ contractAddress, params }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "createLiquidityPosition",
          args: [params],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling createLiquidityPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  decreaseLiquidityPosition: {
    description: "Call decreaseLiquidityPosition function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        params: {
          type: "any",
        },
      },
      required: ["contractAddress", "params"]
    },
    function: async ({ contractAddress, params }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "decreaseLiquidityPosition",
          args: [params],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling decreaseLiquidityPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  increaseLiquidityPosition: {
    description: "Call increaseLiquidityPosition function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "increaseLiquidityPosition",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling increaseLiquidityPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  quoteLiquidityPositionTokens: {
    description: "Call quoteLiquidityPositionTokens function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "quoteLiquidityPositionTokens",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  quoteRequiredCollateral: {
    description: "Call quoteRequiredCollateral function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
      },
      required: ["contractAddress"]
    },
    function: async ({ contractAddress }) => {
      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "quoteRequiredCollateral",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  depositCollateral: {
    description: "The fee collector is maybe an L2 sequencer that deposits its fees periodically instead of having upfront capital.  it's like a smart/trusted margin account",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
        },
        collateralAmount: {
          type: "string",
        },
      },
      required: ["contractAddress", "positionId", "collateralAmount"]
    },
    function: async ({ contractAddress, positionId, collateralAmount }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "depositCollateral",
          args: [BigInt(positionId), BigInt(collateralAmount)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling depositCollateral on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getTokensFromLiquidity: {
    description: "Call getTokensFromLiquidity function on ILiquidityModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        liquidity: {
          type: "string",
        },
        sqrtPriceX96: {
          type: "string",
        },
        sqrtPriceAX96: {
          type: "string",
        },
        sqrtPriceBX96: {
          type: "string",
        },
      },
      required: ["contractAddress", "liquidity", "sqrtPriceX96", "sqrtPriceAX96", "sqrtPriceBX96"]
    },
    function: async ({ contractAddress, liquidity, sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96 }) => {
      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "getTokensFromLiquidity",
          args: [BigInt(liquidity), BigInt(sqrtPriceX96), BigInt(sqrtPriceAX96), BigInt(sqrtPriceBX96)],
        });

        return {
          amount0: result[0],
          amount1: result[1],
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
