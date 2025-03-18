// MCP Tool for IUMASettlementModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IUMASettlementModuleABI from '../out/IUMASettlementModule.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const IUMASettlementModuleTools = {
  submitSettlementPrice: {
    description: "Call submitSettlementPrice function on IUMASettlementModule contract",
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
          abi: parseAbi(IUMASettlementModuleABI),
          functionName: "submitSettlementPrice",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling submitSettlementPrice on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  assertionResolvedCallback: {
    description: "Call assertionResolvedCallback function on IUMASettlementModule contract",
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
          abi: parseAbi(IUMASettlementModuleABI),
          functionName: "assertionResolvedCallback",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling assertionResolvedCallback on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  assertionDisputedCallback: {
    description: "Call assertionDisputedCallback function on IUMASettlementModule contract",
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
          abi: parseAbi(IUMASettlementModuleABI),
          functionName: "assertionDisputedCallback",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling assertionDisputedCallback on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
