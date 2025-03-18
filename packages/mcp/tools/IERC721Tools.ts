// MCP Tool for IERC721
import { createPublicClient, http, parseAbi, encodeFunctionData, createWalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Import ABI from Foundry artifacts
import abiJson from '../out/abi.json';

// Parse the ABI from the JSON strings
const parsedABI = abiJson.IERC721.map(item => JSON.parse(item));

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
export const IERC721Tools = {
  balanceOf: {
    description: "Returns the number of tokens in ``owner``'s account.",
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
      },
      required: ["contractAddress", "owner"]
    },
    function: async ({ contractAddress, owner }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "balanceOf",
          args: [owner]
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  ownerOf: {
    description: "Returns the owner of the `tokenId` token.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        tokenId: {
          type: "string",
        },
      },
      required: ["contractAddress", "tokenId"]
    },
    function: async ({ contractAddress, tokenId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "ownerOf",
          args: [BigInt(tokenId)]
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  safeTransferFrom: {
    description: "Safely transfers `tokenId` token from `from` to `to`.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        from: {
          type: "string",
        },
        to: {
          type: "string",
        },
        tokenId: {
          type: "string",
        },
        data: {
          type: "string",
        },
      },
      required: ["contractAddress", "from", "to", "tokenId", "data"]
    },
    function: async ({ contractAddress, from, to, tokenId, data: dataParam }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "safeTransferFrom",
          args: [from, to, BigInt(tokenId), data]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  safeTransferFrom2: {
    description: "Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        from: {
          type: "string",
        },
        to: {
          type: "string",
        },
        tokenId: {
          type: "string",
        },
      },
      required: ["contractAddress", "from", "to", "tokenId"]
    },
    function: async ({ contractAddress, from, to, tokenId }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "safeTransferFrom",
          args: [from, to, BigInt(tokenId)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  transferFrom: {
    description: "Transfers `tokenId` token from `from` to `to`.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        from: {
          type: "string",
        },
        to: {
          type: "string",
        },
        tokenId: {
          type: "string",
        },
      },
      required: ["contractAddress", "from", "to", "tokenId"]
    },
    function: async ({ contractAddress, from, to, tokenId }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "transferFrom",
          args: [from, to, BigInt(tokenId)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  approve: {
    description: "Gives permission to `to` to transfer `tokenId` token to another account.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        to: {
          type: "string",
        },
        tokenId: {
          type: "string",
        },
      },
      required: ["contractAddress", "to", "tokenId"]
    },
    function: async ({ contractAddress, to, tokenId }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "approve",
          args: [to, BigInt(tokenId)]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  setApprovalForAll: {
    description: "Approve or remove `operator` as an operator for the caller.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        operator: {
          type: "string",
        },
        approved: {
          type: "boolean",
        },
      },
      required: ["contractAddress", "operator", "approved"]
    },
    function: async ({ contractAddress, operator, approved }) => {
      if (!hasPrivateKey) {
        return { error: "Private key not configured" };
      }

      try {
        const hash = await walletClient!.writeContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "setApprovalForAll",
          args: [operator, approved]
        });

        return { hash };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  getApproved: {
    description: "Returns the account approved for `tokenId` token.",
    parameters: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "The address of the contract to interact with"
        },
        tokenId: {
          type: "string",
        },
      },
      required: ["contractAddress", "tokenId"]
    },
    function: async ({ contractAddress, tokenId }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "getApproved",
          args: [BigInt(tokenId)]
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

  isApprovedForAll: {
    description: "Returns if the `operator` is allowed to manage all of the assets of `owner`.",
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
        operator: {
          type: "string",
        },
      },
      required: ["contractAddress", "owner", "operator"]
    },
    function: async ({ contractAddress, owner, operator }) => {
      try {
        const result = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: parsedABI,
          functionName: "isApprovedForAll",
          args: [owner, operator]
        });

        return { result };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    }
  },

};
