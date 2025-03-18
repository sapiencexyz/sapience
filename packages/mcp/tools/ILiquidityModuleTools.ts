// MCP Tool for ILiquidityModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Helper function to convert BigInts to strings in objects
function replaceBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    if (Array.isArray(obj)) {
        return obj.map(replaceBigInts);
    }
    if (typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, replaceBigInts(value)])
        );
    }
    return obj;
}

// Process ABI and handle struct types
const parsedABI = abiJson.map(item => {
  // Convert struct types to tuples
  if (item.type === 'function') {
    item.inputs = item.inputs.map((input: any) => {
      if (input.internalType?.startsWith('struct ')) {
        const structName = input.internalType.split('struct ')[1];
        if (structName.includes('.')) {
          const [_, actualStructName] = structName.split('.');
          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);
          if (structDef) {
            return { ...input, type: 'tuple', components: structDef.members };
          }
        }
      }
      return input;
    });
    item.outputs = item.outputs.map((output: any) => {
      if (output.internalType?.startsWith('struct ')) {
        const structName = output.internalType.split('struct ')[1];
        if (structName.includes('.')) {
          const [_, actualStructName] = structName.split('.');
          const structDef = abiJson.find((s: any) => s.type === 'struct' && s.name === actualStructName);
          if (structDef) {
            return { ...output, type: 'tuple', components: structDef.members };
          }
        }
      }
      return output;
    });
  }
  return item;
});

// Filter ABI to only include functions
const functionABI = parsedABI.filter(item => item.type === 'function');

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
          abi: functionABI,
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
          abi: functionABI,
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
        params: {
          type: "any",
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
          abi: functionABI,
          functionName: "increaseLiquidityPosition",
          args: [params]
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
        epochId: {
          type: "string",
        },
        depositedCollateralAmount: {
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
      required: ["contractAddress", "epochId", "depositedCollateralAmount", "sqrtPriceX96", "sqrtPriceAX96", "sqrtPriceBX96"]
    },
    function: async ({ contractAddress, epochId, depositedCollateralAmount, sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96 }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "quoteLiquidityPositionTokens",
          args: [BigInt(epochId), BigInt(depositedCollateralAmount), BigInt(sqrtPriceX96), BigInt(sqrtPriceAX96), BigInt(sqrtPriceBX96)]
        });

        return { result: replaceBigInts(result) };
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
        positionId: {
          type: "string",
        },
        liquidity: {
          type: "string",
        },
      },
      required: ["contractAddress", "positionId", "liquidity"]
    },
    function: async ({ contractAddress, positionId, liquidity }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: functionABI,
          functionName: "quoteRequiredCollateral",
          args: [BigInt(positionId), BigInt(liquidity)]
        });

        return { result: replaceBigInts(result) };
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
          abi: functionABI,
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
          abi: functionABI,
          functionName: "getTokensFromLiquidity",
          args: [BigInt(liquidity), BigInt(sqrtPriceX96), BigInt(sqrtPriceAX96), BigInt(sqrtPriceBX96)]
        });

        return { result: replaceBigInts(result) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
