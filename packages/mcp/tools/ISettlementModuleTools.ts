// MCP Tool for ISettlementModule
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import ISettlementModuleABI from '../out/ISettlementModule.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const ISettlementModuleTools = {
  settlePosition: {
    description: "Call settlePosition function on ISettlementModule contract",
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
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(ISettlementModuleABI),
          functionName: "settlePosition",
          args: [BigInt(positionId)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling settlePosition on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  __manual_setSettlementPrice: {
    description: "Call __manual_setSettlementPrice function on ISettlementModule contract",
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
          abi: parseAbi(ISettlementModuleABI),
          functionName: "__manual_setSettlementPrice",
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling __manual_setSettlementPrice on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
