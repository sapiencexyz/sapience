// MCP Tool for IConfigurationModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IConfigurationModuleABI from '../out/IConfigurationModule.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const IConfigurationModuleTools = {
  initializeMarket: {
    description: "Call initializeMarket function on IConfigurationModule contract",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        owner: {
          type: "string",
        },
        collateralAsset: {
          type: "string",
        },
        feeCollectors: {
          type: "string[]",
        },
        callbackRecipient: {
          type: "string",
        },
        minTradeSize: {
          type: "string",
        },
        marketParams: {
          type: "any",
        },
      },
      required: ["contractAddress", "owner", "collateralAsset", "feeCollectors", "callbackRecipient", "minTradeSize", "marketParams"]
    },
    function: async ({ contractAddress, owner, collateralAsset, feeCollectors, callbackRecipient, minTradeSize, marketParams }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IConfigurationModuleABI),
          functionName: "initializeMarket",
          args: [owner, collateralAsset, feeCollectors, callbackRecipient, BigInt(minTradeSize), marketParams],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling initializeMarket on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  updateMarket: {
    description: "Call updateMarket function on IConfigurationModule contract",
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
          abi: parseAbi(IConfigurationModuleABI),
          functionName: "updateMarket",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling updateMarket on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  createEpoch: {
    description: "Call createEpoch function on IConfigurationModule contract",
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
          abi: parseAbi(IConfigurationModuleABI),
          functionName: "createEpoch",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling createEpoch on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
