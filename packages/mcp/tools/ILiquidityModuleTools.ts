// MCP Tool for ILiquidityModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Parse the ABI from the JSON strings
const parsedABI = abiJson.ILiquidityModule.map(item => JSON.parse(item));

// TypeScript types for structs
export type ILiquidityModuleStructs = {
  DecreaseLiquidityPositionStack: {
    previousAmount0: bigint;
    previousAmount1: bigint;
    previousLiquidity: bigint;
    lowerTick: bigint;
    upperTick: bigint;
    decreaseParams: any;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
    isFeeCollector: boolean;
    requiredCollateralAmount: bigint;
    newCollateralAmount: bigint;
    loanAmount0: bigint;
    loanAmount1: bigint;
  };
  IncreaseLiquidityPositionStack: {
    previousAmount0: bigint;
    previousAmount1: bigint;
    previousLiquidity: bigint;
    lowerTick: bigint;
    upperTick: bigint;
    increaseParams: any;
    tokensOwed0: bigint;
    tokensOwed1: bigint;
    isFeeCollector: boolean;
    requiredCollateralAmount: bigint;
    newCollateralAmount: bigint;
    loanAmount0: bigint;
    loanAmount1: bigint;
  };
};

// Configure viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
const hasPrivateKey = !!privateKey;
const walletClient = hasPrivateKey ? createWalletClient({
  account: privateKeyToAccount(privateKey as `0x${string}`),
  chain: base,
  transport: http()
}) : null;

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
          description: "The parameters for creating the liquidity position",
        },
      },
      required: ["contractAddress", "params"]
    },
    function: async ({ contractAddress, params }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "createLiquidityPosition",
          args: [params]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
          description: "The parameters for decreasing the liquidity position",
        },
      },
      required: ["contractAddress", "params"]
    },
    function: async ({ contractAddress, params }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "decreaseLiquidityPosition",
          args: [params]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "increaseLiquidityPosition",
          args: []
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "quoteLiquidityPositionTokens",
          args: []
        });

        return { success: true };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "quoteRequiredCollateral",
          args: []
        });

        return { success: true };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  depositCollateral: {
    description: "The fee collector is maybe an L2 sequencer that deposits its fees periodically instead of",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "The ID of the liquidity position (fee collector has to be owner)",
        },
        collateralAmount: {
          type: "string",
          description: "The amount of collateral to increase",
        },
      },
      required: ["contractAddress", "positionId", "collateralAmount"]
    },
    function: async ({ contractAddress, positionId, collateralAmount }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "depositCollateral",
          args: [BigInt(positionId), BigInt(collateralAmount)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
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
          description: "The amount of liquidity",
        },
        sqrtPriceX96: {
          type: "string",
          description: "The current sqrt price",
        },
        sqrtPriceAX96: {
          type: "string",
          description: "The sqrt price of the lower tick",
        },
        sqrtPriceBX96: {
          type: "string",
          description: "The sqrt price of the upper tick",
        },
      },
      required: ["contractAddress", "liquidity", "sqrtPriceX96", "sqrtPriceAX96", "sqrtPriceBX96"]
    },
    function: async ({ contractAddress, liquidity, sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96 }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "getTokensFromLiquidity",
          args: [BigInt(liquidity), BigInt(sqrtPriceX96), BigInt(sqrtPriceAX96), BigInt(sqrtPriceBX96)]
        });

        return {
          amount0: (result as [bigint, bigint])[0],
          amount1: (result as [bigint, bigint])[1],
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
