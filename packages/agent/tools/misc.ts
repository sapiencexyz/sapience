import { createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import ERC20ABI from '../abi/ERC20.json';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ETHEREUM_PRIVATE_KEY: string;
      SAFE_SERVICE_API_KEY: string;
    }
  }
}

// Safe service URLs for different chains
const SAFE_SERVICE_URLS: Record<string, string> = {
  '1': 'https://safe-transaction-mainnet.safe.global',
  '5': 'https://safe-transaction-goerli.safe.global',
  '10': 'https://safe-transaction-optimism.safe.global',
  '56': 'https://safe-transaction-bsc.safe.global',
  '100': 'https://safe-transaction-gnosis-chain.safe.global',
  '137': 'https://safe-transaction-polygon.safe.global',
  '8453': 'https://safe-transaction-base.safe.global',
  '42161': 'https://safe-transaction-arbitrum.safe.global',
  '43114': 'https://safe-transaction-avalanche.safe.global',
  '1313161554': 'https://safe-transaction-aurora.safe.global',
  '1666600000': 'https://safe-transaction-harmony.safe.global',
  '11297108109': 'https://safe-transaction-palm.safe.global',
  '1284': 'https://safe-transaction-moonbeam.safe.global',
  '1285': 'https://safe-transaction-moonriver.safe.global',
  '1287': 'https://safe-transaction-moonbase-alpha.safe.global',
  '80001': 'https://safe-transaction-mumbai.safe.global',
  '420': 'https://safe-transaction-optimism-goerli.safe.global',
  '421613': 'https://safe-transaction-arbitrum-goerli.safe.global',
  '43113': 'https://safe-transaction-avalanche-fuji.safe.global',
  '1666700000': 'https://safe-transaction-harmony-testnet.safe.global',
  '1337': 'https://safe-transaction-gateway.safe.global' // For local development
};

// Create a wallet client for executing transactions
const walletClient = createWalletClient({
  chain: base,
  transport: http(),
  account: privateKeyToAccount(process.env.ETHEREUM_PRIVATE_KEY as `0x${string}`)
});

export const stageTransaction = {
  name: "stage_transaction",
  description: "Stages a transaction to the safe service",
  parameters: {
    properties: {
      calldata: {
        type: "string",
        description: "The calldata for the transaction"
      },
      to: {
        type: "string",
        description: "The address to send the transaction to"
      },
      value: {
        type: "string",
        description: "The amount of ETH to send with the transaction"
      },
      chainId: {
        type: "string",
        description: "The chain ID to execute the transaction on"
      },
      safeAddress: {
        type: "string",
        description: "The address of the safe to stage the transaction to"
      }
    },
    required: ["calldata", "to", "value", "chainId", "safeAddress"],
  },
  function: async (args: { calldata: string; to: string; value: string; chainId: string; safeAddress: string }) => {
    try {
      const safeServiceUrl = SAFE_SERVICE_URLS[args.chainId];
      if (!safeServiceUrl) {
        throw new Error(`No Safe service URL configured for chain ID ${args.chainId}`);
      }

      const response = await fetch(`${safeServiceUrl}/api/v1/safes/${args.safeAddress}/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SAFE_SERVICE_API_KEY}`
        },
        body: JSON.stringify({
          to: args.to,
          data: args.calldata,
          value: args.value,
          chainId: args.chainId,
          safeTxGas: "0", // Let the safe service estimate this
          operation: 0, // Call operation
          gasToken: "0x0000000000000000000000000000000000000000", // Native token
          refundReceiver: "0x0000000000000000000000000000000000000000", // No refund receiver
          nonce: "0", // Let the safe service determine the nonce
          safeTxHash: "0x", // Will be calculated by the safe service
          signatures: "0x", // Will be added by the safe service
          origin: "foil-agent" // Identifier for the transaction origin
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Safe service error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error staging transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const executeTransaction = {
  name: "execute_transaction",
  description: "Executes a transaction using viem and the private key from env.ETHEREUM_PRIVATE_KEY",
  parameters: {
    properties: {
      calldata: {
        type: "string",
        description: "The calldata for the transaction"
      },
      to: {
        type: "string",
        description: "The address to send the transaction to"
      },
      value: {
        type: "string",
        description: "The amount of ETH to send with the transaction"
      },
      chainId: {
        type: "string",
        description: "The chain ID to execute the transaction on"
      }
    },
    required: ["calldata", "to", "value", "chainId"],
  },
  function: async (args: { calldata: string; to: string; value: string; chainId: string }) => {
    try {
      const account = privateKeyToAccount(process.env.ETHEREUM_PRIVATE_KEY as `0x${string}`);
      const hash = await walletClient.sendTransaction({
        account,
        chain: base,
        to: args.to as `0x${string}`,
        data: args.calldata as `0x${string}`,
        value: BigInt(args.value),
        kzg: undefined
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ hash }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error executing transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
};

export const approveToken = {
  name: "approve_token",
  description: "Returns the calldata for an ERC-20 approval",
  parameters: {
    properties: {
      tokenAddress: {
        type: "string",
        description: "The address of the ERC-20 token to approve"
      },
      spender: {
        type: "string",
        description: "The address to approve to spend the tokens"
      },
      amount: {
        type: "string",
        description: "The amount of tokens to approve"
      }
    },
    required: ["tokenAddress", "spender", "amount"],
  },
  function: async (args: { tokenAddress: string; spender: string; amount: string }) => {
    try {
      const calldata = encodeFunctionData({
        abi: ERC20ABI.abi,
        functionName: 'approve',
        args: [args.spender as `0x${string}`, BigInt(args.amount)]
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            to: args.tokenAddress,
            data: calldata
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error encoding approve: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
}; 