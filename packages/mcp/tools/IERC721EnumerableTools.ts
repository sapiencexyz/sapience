// MCP Tool for IERC721Enumerable
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import IERC721EnumerableABI from '../out/IERC721Enumerable.ast.json';

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
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "totalSupply",
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  tokenOfOwnerByIndex: {
    description: "Returns a token ID owned by `owner` at a given `index` of its token list.",
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
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "tokenOfOwnerByIndex",
args: [owner, BigInt(index)],
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  tokenByIndex: {
    description: "Returns a token ID at a given `index` of all the tokens stored by the contract.",
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
        const result = await publicClient.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721EnumerableABI),
          functionName: "tokenByIndex",
args: [BigInt(index)],
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
