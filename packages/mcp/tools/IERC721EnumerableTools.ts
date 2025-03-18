// MCP Tool for IERC721Enumerable
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IERC721EnumerableABI from '../out/IERC721Enumerable.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

// MCP Tool Definitions
export const IERC721EnumerableTools = {
  totalSupply: {
    description: "Returns the total amount of tokens stored by the contract.",
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
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "totalSupply",
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  tokenOfOwnerByIndex: {
    description: "Returns a token ID owned by `owner` at a given `index` of its token list. Use along with {balanceOf} to enumerate all of ``owner``'s tokens. Requirements: - `owner` must be a valid address - `index` must be less than the balance of the tokens for the owner",
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
        index: {
          type: "string",
        },
      },
      required: ["contractAddress", "owner", "index"]
    },
    function: async ({ contractAddress, owner, index }) => {
      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "tokenOfOwnerByIndex",
          args: [owner, BigInt(index)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  tokenByIndex: {
    description: "Returns a token ID at a given `index` of all the tokens stored by the contract. Use along with {totalSupply} to enumerate all tokens. Requirements: - `index` must be less than the total supply of the tokens",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        index: {
          type: "string",
        },
      },
      required: ["contractAddress", "index"]
    },
    function: async ({ contractAddress, index }) => {
      try {
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "tokenByIndex",
          args: [BigInt(index)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
