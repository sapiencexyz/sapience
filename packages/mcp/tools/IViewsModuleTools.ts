// MCP Tool for IViewsModule
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import IViewsModuleABI from '../out/IViewsModule.ast.json';

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
export const IViewsModuleTools = {
  getMarket: {
    description: "Call getMarket function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getMarket",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getEpoch: {
    description: "Call getEpoch function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getEpoch",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getLatestEpoch: {
    description: "Call getLatestEpoch function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getLatestEpoch",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getPosition: {
    description: "Call getPosition function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPosition",
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPosition",
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called getPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getPositionSize: {
    description: "Call getPositionSize function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPositionSize",
        });

        // Send transaction
        const hash = await walletClient.writeContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPositionSize",
        });

        // Wait for transaction
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
          hash,
          receipt,
          description: `Called getPositionSize on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getSqrtPriceX96: {
    description: "Call getSqrtPriceX96 function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "id of the epoch to get the reference price",
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getSqrtPriceX96",
args: [BigInt(epochId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getReferencePrice: {
    description: "Call getReferencePrice function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        epochId: {
          type: "string",
          description: "id of the epoch to get the reference price",
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getReferencePrice",
args: [BigInt(epochId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getPositionCollateralValue: {
    description: "Call getPositionCollateralValue function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "id of the position",
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPositionCollateralValue",
args: [BigInt(positionId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getPositionPnl: {
    description: "Call getPositionPnl function on IViewsModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        positionId: {
          type: "string",
          description: "id of the position",
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IViewsModuleABI),
          functionName: "getPositionPnl",
args: [BigInt(positionId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getMarketTickSpacing: {
    description: "Call getMarketTickSpacing function on IViewsModule contract",
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
          abi: parseAbi(IViewsModuleABI),
          functionName: "getMarketTickSpacing",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
