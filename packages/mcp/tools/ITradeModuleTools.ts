// MCP Tool for ITradeModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import ITradeModuleABI from '../out/ITradeModule.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const ITradeModuleTools = {
  createTraderPosition: {
    description: "Create a new trader position.",
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
        size: {
          type: "string",
        },
        maxCollateral: {
          type: "string",
        },
        deadline: {
          type: "string",
        },
      },
      required: ["contractAddress", "epochId", "size", "maxCollateral", "deadline"]
    },
    function: async ({ contractAddress, epochId, size, maxCollateral, deadline }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "createTraderPosition",
          args: [BigInt(epochId), BigInt(size), BigInt(maxCollateral), BigInt(deadline)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling createTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  modifyTraderPosition: {
    description: "Modify an existing trader position.",
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
        size: {
          type: "string",
        },
        deltaCollateralLimit: {
          type: "string",
        },
        deadline: {
          type: "string",
        },
      },
      required: ["contractAddress", "positionId", "size", "deltaCollateralLimit", "deadline"]
    },
    function: async ({ contractAddress, positionId, size, deltaCollateralLimit, deadline }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "modifyTraderPosition",
          args: [BigInt(positionId), BigInt(size), BigInt(deltaCollateralLimit), BigInt(deadline)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling modifyTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  quoteCreateTraderPosition: {
    description: "warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert",
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
        size: {
          type: "string",
        },
      },
      required: ["contractAddress", "epochId", "size"]
    },
    function: async ({ contractAddress, epochId, size }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteCreateTraderPosition",
          args: [BigInt(epochId), BigInt(size)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling quoteCreateTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  quoteModifyTraderPosition: {
    description: "warning: this function shouldn't be called on-chain since it will incur on gas usage. It executes and expect an internal txn to revert",
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
        size: {
          type: "string",
        },
      },
      required: ["contractAddress", "positionId", "size"]
    },
    function: async ({ contractAddress, positionId, size }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ITradeModuleABI),
          functionName: "quoteModifyTraderPosition",
          args: [BigInt(positionId), BigInt(size)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling quoteModifyTraderPosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
