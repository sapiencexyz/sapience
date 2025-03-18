// MCP Tool for ILiquidityModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import ILiquidityModuleABI from '../out/ILiquidityModule.ast.json';

// Configure viem clients
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// Get private key from environment
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error('PRIVATE_KEY environment variable is required for write operations');
}

// Create wallet client
const account = privateKeyToAccount(privateKey as `0x${string}`);
const walletClient = createWalletClient({
  account,
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
          description: "The parameters for creating the liquidity position",
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

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "createLiquidityPosition",
args: [params],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called createLiquidityPosition on ${contractAddress}`
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
          description: "The parameters for decreasing the liquidity position",
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

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "decreaseLiquidityPosition",
args: [params],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called decreaseLiquidityPosition on ${contractAddress}`
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

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "increaseLiquidityPosition",
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called increaseLiquidityPosition on ${contractAddress}`
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
        const result = await publicClient.readContract({
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
        const result = await publicClient.readContract({
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "depositCollateral",
args: [BigInt(positionId), BigInt(collateralAmount)],
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "depositCollateral",
args: [BigInt(positionId), BigInt(collateralAmount)],
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called depositCollateral on ${contractAddress}`
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
          address: contractAddress,
          abi: parseAbi(ILiquidityModuleABI),
          functionName: "getTokensFromLiquidity",
args: [BigInt(liquidity), BigInt(sqrtPriceX96), BigInt(sqrtPriceAX96), BigInt(sqrtPriceBX96)],
        });

        return {
          amount0: (result as [bigint, bigint])[0],
          amount1: (result as [bigint, bigint])[1],
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
