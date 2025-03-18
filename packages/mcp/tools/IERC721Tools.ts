// MCP Tool for IERC721
import { createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';

// Import ABI from Foundry artifacts
import IERC721ABI from '../out/IERC721.ast.json';

// Configure viem client
const client = createPublicClient({
  chain: base,
  transport: http()
});

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
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721ABI),
          functionName: "balanceOf",
          args: [owner],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  ownerOf: {
    description: "Returns the owner of the `tokenId` token. Requirements: - `tokenId` must exist.",
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
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721ABI),
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  safeTransferFrom: {
    description: "Safely transfers `tokenId` token from `from` to `to`. Requirements: - `from` cannot be the zero address. - `to` cannot be the zero address. - `tokenId` token must exist and be owned by `from`. - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}. - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer. Emits a {Transfer} event.",
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
    function: async ({ contractAddress, from, to, tokenId, data }) => {
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IERC721ABI),
          functionName: "safeTransferFrom",
          args: [from, to, BigInt(tokenId), data],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling safeTransferFrom on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  safeTransferFrom: {
    description: "Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients are aware of the ERC721 protocol to prevent tokens from being forever locked. Requirements: - `from` cannot be the zero address. - `to` cannot be the zero address. - `tokenId` token must exist and be owned by `from`. - If the caller is not `from`, it must have been allowed to move this token by either {approve} or {setApprovalForAll}. - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer. Emits a {Transfer} event.",
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IERC721ABI),
          functionName: "safeTransferFrom",
          args: [from, to, BigInt(tokenId)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling safeTransferFrom on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  transferFrom: {
    description: "Transfers `tokenId` token from `from` to `to`. WARNING: Note that the caller is responsible to confirm that the recipient is capable of receiving ERC721 or else they may be permanently lost. Usage of {safeTransferFrom} prevents loss, though the caller must understand this adds an external call which potentially creates a reentrancy vulnerability. Requirements: - `from` cannot be the zero address. - `to` cannot be the zero address. - `tokenId` token must be owned by `from`. - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}. Emits a {Transfer} event.",
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IERC721ABI),
          functionName: "transferFrom",
          args: [from, to, BigInt(tokenId)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling transferFrom on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  approve: {
    description: "Gives permission to `to` to transfer `tokenId` token to another account. The approval is cleared when the token is transferred. Only a single account can be approved at a time, so approving the zero address clears previous approvals. Requirements: - The caller must own the token or be an approved operator. - `tokenId` must exist. Emits an {Approval} event.",
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IERC721ABI),
          functionName: "approve",
          args: [to, BigInt(tokenId)],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling approve on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  setApprovalForAll: {
    description: "Approve or remove `operator` as an operator for the caller. Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller. Requirements: - The `operator` cannot be the address zero. Emits an {ApprovalForAll} event.",
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
      try {
        // Prepare transaction data
        const data = encodeFunctionData({
          abi: parseAbi(IERC721ABI),
          functionName: "setApprovalForAll",
          args: [operator, approved],
        });

        // For MCP we return the transaction data that should be executed
        return {
          to: contractAddress,
          data,
          description: `Calling setApprovalForAll on ${contractAddress}`
        };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  getApproved: {
    description: "Returns the account approved for `tokenId` token. Requirements: - `tokenId` must exist.",
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
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721ABI),
          functionName: "getApproved",
          args: [BigInt(tokenId)],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

  isApprovedForAll: {
    description: "Returns if the `operator` is allowed to manage all of the assets of `owner`. See {setApprovalForAll}",
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
        const result = await client.readContract({
          address: contractAddress,
          abi: parseAbi(IERC721ABI),
          functionName: "isApprovedForAll",
          args: [owner, operator],
        });

        return { result };
      } catch (error) {
        return { error: error.message };
      }
    }
  },

};
