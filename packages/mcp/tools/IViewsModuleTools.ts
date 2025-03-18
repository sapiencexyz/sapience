// MCP Tool for IViewsModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IViewsModuleABI from '../out/IViewsModule.ast.json';

// Configure viem client
const client = createPublicClient({
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
        const result = await client.readContract({
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
        const result = await client.readContract({
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
        const result = await client.readContract({
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

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling getPosition on ${contractAddress}`
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

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling getPositionSize on ${contractAddress}`
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
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await client.readContract({
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
        },
      },
      required: ["contractAddress", "epochId"]
    },
    function: async ({ contractAddress, epochId }) => {
      try {
        const result = await client.readContract({
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
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await client.readContract({
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
        },
      },
      required: ["contractAddress", "positionId"]
    },
    function: async ({ contractAddress, positionId }) => {
      try {
        const result = await client.readContract({
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
        const result = await client.readContract({
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
