// MCP Tool for IERC165Module
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IERC165ModuleABI from '../out/IERC165Module.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const IERC165ModuleTools = {
  supportsInterface: {
    description: "Call supportsInterface function on IERC165Module contract",
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
          abi: parseAbi(IERC165ModuleABI),
          functionName: "supportsInterface",
        });

        return { success: true };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
