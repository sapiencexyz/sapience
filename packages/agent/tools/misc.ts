import { createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount, signMessage } from 'viem/accounts';
import ERC20ABI from '../abi/ERC20.json';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the agent package directory
config({ path: join(__dirname, '..', '.env') });

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ETHEREUM_PRIVATE_KEY: string;
      TWITTER_API_KEY: string;
      TWITTER_API_SECRET: string;
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

      // Create the transaction data
      const safeTransactionData = {
        to: args.to,
        value: args.value,
        data: args.calldata,
        operation: 0, // Call operation
        safeTxGas: "0",
        baseGas: "0",
        gasPrice: "0",
        gasToken: "0x0000000000000000000000000000000000000000",
        refundReceiver: "0x0000000000000000000000000000000000000000",
        nonce: "0"
      };

      // Get the transaction hash
      const response = await fetch(`${safeServiceUrl}/api/v1/safes/${args.safeAddress}/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(safeTransactionData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Safe service error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      const safeTxHash = result.safeTxHash;

      // Sign the transaction hash using viem
      const signature = await signMessage({
        privateKey: process.env.ETHEREUM_PRIVATE_KEY as `0x${string}`,
        message: { raw: safeTxHash as `0x${string}` }
      });

      // Send the transaction with the signature
      const proposeResponse = await fetch(`${safeServiceUrl}/api/v1/safes/${args.safeAddress}/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...safeTransactionData,
          safeTxHash,
          signatures: signature
        })
      });

      if (!proposeResponse.ok) {
        const error = await proposeResponse.json();
        throw new Error(`Safe service error: ${JSON.stringify(error)}`);
      }

      const proposeResult = await proposeResponse.json();

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(proposeResult, null, 2)
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
      if (!process.env.ETHEREUM_PRIVATE_KEY) {
        throw new Error("ETHEREUM_PRIVATE_KEY environment variable is not set");
      }

      const account = privateKeyToAccount(process.env.ETHEREUM_PRIVATE_KEY as `0x${string}`);
      const walletClient = createWalletClient({
        chain: base,
        transport: http(),
        account
      });

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

export const tweet = {
  name: "tweet",
  description: "Sends a tweet or thread to Twitter",
  parameters: {
    properties: {
      tweets: {
        type: "array",
        description: "Array of tweets to send as a thread. If only one tweet, it will be sent as a single tweet.",
        items: {
          type: "string"
        }
      }
    },
    required: ["tweets"],
  },
  function: async (args: { tweets: string[] }) => {
    try {
      if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
        throw new Error("Twitter API credentials not configured");
      }

      if (args.tweets.length === 0) {
        throw new Error("No tweets provided");
      }

      if (args.tweets.length > 10) {
        throw new Error("Maximum of 10 tweets allowed in a thread");
      }

      // Send the first tweet
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TWITTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: args.tweets[0]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      let lastTweetId = result.data.id;

      // If there are more tweets, send them as replies
      for (let i = 1; i < args.tweets.length; i++) {
        const replyResponse = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TWITTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: args.tweets[i],
            reply: {
              in_reply_to_tweet_id: lastTweetId
            }
          })
        });

        if (!replyResponse.ok) {
          const error = await replyResponse.json();
          throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
        }

        const replyResult = await replyResponse.json();
        lastTweetId = replyResult.data.id;
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: `Successfully sent ${args.tweets.length} tweet${args.tweets.length > 1 ? 's' : ''}`
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error sending tweet(s): ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  },
}; 