/**
 * x402 payment middleware configuration for the API server.
 *
 * Protects routes behind USDC micropayments on Arbitrum One.
 * Runs the facilitator in-process (no separate service needed).
 * Uses dynamic pricing based on GraphQL query complexity.
 */
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme as registerServerEvmScheme } from '@x402/evm/exact/server';
import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactEvmScheme as registerFacilitatorEvmScheme } from '@x402/evm/exact/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { config } from './config';
import {
  createWalletClient,
  http,
  publicActions,
  createPublicClient,
  formatGwei,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import type { Request, Response, NextFunction } from 'express';
import { parse } from 'graphql';
import {
  getComplexity,
  createComplexityEstimators,
} from './graphql/queryComplexity';
import { SharedSchema } from './graphql/sharedSchema';

const NETWORK = 'eip155:42161' as const;
// Native USDC on Arbitrum One (Circle's FiatTokenV2_2, supports EIP-3009)
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

// Payment configuration - tiered by GraphQL query complexity
// Thresholds based on actual field costs from the GraphQL schema:
// - Simple queries (basic field selections, small lists): 1-1000
// - Medium queries (moderate lists, some aggregations): 1000-5000
// - Complex queries (expensive aggregations, large lists): 5000+
const COMPLEXITY_TIERS = {
  simple: { maxComplexity: 1000, priceUSDC: 5000, priceUSD: 0.005 }, // $0.005 for simple queries
  medium: { maxComplexity: 5000, priceUSDC: 15000, priceUSD: 0.015 }, // $0.015 for medium queries
  complex: { maxComplexity: Infinity, priceUSDC: 30000, priceUSD: 0.03 }, // $0.03 for complex queries
};

// Gas estimation for EIP-3009 transferWithAuthorization
// Typical gas usage: ~60,000-80,000 gas units
const ESTIMATED_GAS_UNITS = 80000;

// Chainlink ETH/USD price feed on Arbitrum One
const CHAINLINK_ETH_USD = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';
const CHAINLINK_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

// Create public client for gas price + Chainlink reads
const publicClient = createPublicClient({
  chain: arbitrum,
  transport: http(config.X402_ARBITRUM_RPC_URL),
});

// Cache ETH/USD price for 60 seconds to avoid hitting the oracle on every request
let cachedEthPrice: { price: number; fetchedAt: number } | null = null;
const ETH_PRICE_CACHE_MS = 60_000;
const ETH_PRICE_FALLBACK = 3000;

async function getEthUsdPrice(): Promise<number> {
  if (
    cachedEthPrice &&
    Date.now() - cachedEthPrice.fetchedAt < ETH_PRICE_CACHE_MS
  ) {
    return cachedEthPrice.price;
  }

  try {
    const [, answer] = await publicClient.readContract({
      address: CHAINLINK_ETH_USD,
      abi: CHAINLINK_ABI,
      functionName: 'latestRoundData',
    });
    // Chainlink ETH/USD uses 8 decimals
    const price = Number(answer) / 1e8;
    cachedEthPrice = { price, fetchedAt: Date.now() };
    return price;
  } catch (error) {
    console.error('[x402] Error fetching ETH/USD price from Chainlink:', error);
    return cachedEthPrice?.price ?? ETH_PRICE_FALLBACK;
  }
}

/**
 * Calculate GraphQL query complexity using the same estimators as Apollo validation
 * Returns a complexity score used for tiered pricing (0-10000+)
 */
function calculateGraphQLComplexity(
  query: string,
  variables?: Record<string, unknown>
): number {
  if (!query) return 1;

  try {
    // Parse the GraphQL query
    const document = parse(query);

    // Get the schema from SharedSchema singleton
    const sharedSchema = SharedSchema.getInstance();
    const schema = sharedSchema.schema;

    if (!schema) {
      console.warn(
        '[x402] GraphQL schema not available, using fallback complexity=1'
      );
      return 1;
    }

    const complexity = getComplexity({
      schema,
      query: document,
      variables: variables ?? {},
      estimators: createComplexityEstimators(config.GRAPHQL_MAX_LIST_SIZE),
    });

    return complexity;
  } catch (error) {
    console.error('[x402] Error calculating query complexity:', error);
    // On error, charge the highest tier to prevent abuse
    return Infinity;
  }
}

/**
 * Get the appropriate pricing tier based on query complexity
 */
function getComplexityTier(complexity: number): typeof COMPLEXITY_TIERS.simple {
  if (complexity <= COMPLEXITY_TIERS.simple.maxComplexity) {
    return COMPLEXITY_TIERS.simple;
  } else if (complexity <= COMPLEXITY_TIERS.medium.maxComplexity) {
    return COMPLEXITY_TIERS.medium;
  } else {
    return COMPLEXITY_TIERS.complex;
  }
}

/**
 * Check if current gas costs exceed the payment amount
 * Returns true if gas cost > payment (unprofitable to settle)
 */
async function isGasTooExpensive(
  paymentAmountUSD: number
): Promise<{ tooExpensive: boolean; gasCostUSD: number; gasPrice: string }> {
  try {
    // Get current gas price on Arbitrum
    const gasPrice = await publicClient.getGasPrice();

    // Calculate gas cost in wei
    const gasCostWei = gasPrice * BigInt(ESTIMATED_GAS_UNITS);

    // Convert to ETH
    const gasCostETH = Number(gasCostWei) / 1e18;

    // Real-time ETH/USD from Chainlink (cached 60s, falls back to $3000)
    const ethUsdRate = await getEthUsdPrice();
    const gasCostUSD = gasCostETH * ethUsdRate;

    // Gas is too expensive if it costs more than the payment
    const tooExpensive = gasCostUSD > paymentAmountUSD;

    return {
      tooExpensive,
      gasCostUSD,
      gasPrice: formatGwei(gasPrice),
    };
  } catch (error) {
    console.error('Error checking gas price:', error);
    // On error, assume gas is not too expensive (fail open)
    return { tooExpensive: false, gasCostUSD: 0, gasPrice: '0' };
  }
}

/**
 * Create x402 server with in-process facilitator (no separate service needed).
 * The facilitator verifies and settles payments directly using the configured private key.
 */
function createX402Server() {
  if (!config.X402_FACILITATOR_PRIVATE_KEY) {
    throw new Error(
      '[x402] X402_FACILITATOR_PRIVATE_KEY is required for payment processing'
    );
  }

  // Create viem wallet client for on-chain settlement
  const account = privateKeyToAccount(
    config.X402_FACILITATOR_PRIVATE_KEY as `0x${string}`
  );
  const client = createWalletClient({
    chain: arbitrum,
    transport: http(config.X402_ARBITRUM_RPC_URL),
    account,
  }).extend(publicActions);

  // Wrap as x402 FacilitatorEvmSigner
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    readContract: (args) =>
      client.readContract(args as Parameters<typeof client.readContract>[0]),
    verifyTypedData: (args) =>
      client.verifyTypedData(
        args as Parameters<typeof client.verifyTypedData>[0]
      ),
    writeContract: (args) =>
      client.writeContract(args as Parameters<typeof client.writeContract>[0]),
    sendTransaction: (args) =>
      client.sendTransaction(
        args as Parameters<typeof client.sendTransaction>[0]
      ),
    waitForTransactionReceipt: (args) => client.waitForTransactionReceipt(args),
    getCode: (args) => client.getCode(args),
  });

  // Create in-process facilitator
  const facilitator = new x402Facilitator();
  registerFacilitatorEvmScheme(facilitator, {
    signer,
    networks: NETWORK,
  });

  // Wrap as a FacilitatorClient for the resource server.
  // Use the facilitator directly — its verify/settle/getSupported signatures
  // match FacilitatorClient, just need getSupported to return a Promise.
  const localClient = {
    verify: facilitator.verify.bind(facilitator),
    settle: facilitator.settle.bind(facilitator),
    getSupported: () => Promise.resolve(facilitator.getSupported()),
  };

  // Cast needed: x402Facilitator.getSupported() returns concrete types
  // while FacilitatorClient expects branded `Network` string type
  const server = new x402ResourceServer(
    localClient as unknown as FacilitatorClient
  );
  registerServerEvmScheme(server);

  console.log(
    `[x402] In-process facilitator initialized (address: ${account.address})`
  );

  return server;
}

/**
 * Create x402 middleware for a specific price tier
 */
function createX402MiddlewareForTier(
  priceUSDC: number,
  description: string,
  server: x402ResourceServer
) {
  return paymentMiddleware(
    {
      '* *': {
        accepts: {
          scheme: 'exact',
          network: NETWORK,
          price: {
            asset: USDC_ARBITRUM,
            amount: String(priceUSDC),
            extra: {
              assetTransferMethod: 'eip3009',
              name: 'USD Coin',
              version: '2',
            },
          },
          payTo: config.X402_PAY_TO,
        },
        description,
        mimeType: 'application/json',
      },
    },
    server
  );
}

/**
 * Middleware wrapper that:
 * 1. Analyzes GraphQL query complexity for dynamic pricing
 * 2. Checks gas costs before requiring payment
 * 3. Routes to appropriate payment tier
 * If gas > payment, returns 503 instead of 402
 */
export function createGasAwareX402Middleware() {
  // Create shared x402 server instance
  const server = createX402Server();

  // Create middleware instances for each pricing tier
  const simpleMiddleware = createX402MiddlewareForTier(
    COMPLEXITY_TIERS.simple.priceUSDC,
    'API access - simple query',
    server
  );
  const mediumMiddleware = createX402MiddlewareForTier(
    COMPLEXITY_TIERS.medium.priceUSDC,
    'API access - medium complexity query',
    server
  );
  const complexMiddleware = createX402MiddlewareForTier(
    COMPLEXITY_TIERS.complex.priceUSDC,
    'API access - complex query',
    server
  );

  return async (req: Request, res: Response, next: NextFunction) => {
    // Determine pricing tier based on query complexity (for GraphQL requests)
    let tier = COMPLEXITY_TIERS.simple; // Default for non-GraphQL
    let complexity = 0;

    if (req.path === '/graphql' && req.method === 'POST' && req.body?.query) {
      complexity = calculateGraphQLComplexity(
        req.body.query,
        req.body.variables
      );
      tier = getComplexityTier(complexity);

      console.log(
        `[x402] GraphQL query complexity: ${complexity} (tier: ${tier === COMPLEXITY_TIERS.simple ? 'simple' : tier === COMPLEXITY_TIERS.medium ? 'medium' : 'complex'}, price: $${tier.priceUSD})`
      );
    }

    // Check if gas is too expensive before requiring payment
    const { tooExpensive, gasCostUSD, gasPrice } = await isGasTooExpensive(
      tier.priceUSD
    );

    if (tooExpensive) {
      console.warn(
        `[x402] Gas too expensive (${gasCostUSD.toFixed(6)} USD > ${tier.priceUSD} USD payment). ` +
          `Gas price: ${gasPrice} gwei. Returning 503.`
      );

      res.status(503).json({
        error: 'Service Temporarily Unavailable',
        message:
          'Payment settlement costs exceed payment amount due to high gas prices. Please try again later.',
        details: {
          gasCostUSD: gasCostUSD.toFixed(6),
          paymentAmountUSD: tier.priceUSD.toFixed(3),
          gasPrice: `${gasPrice} gwei`,
          reason: 'Unprofitable to settle payment on-chain',
        },
        retryAfter: 300, // Suggest retry in 5 minutes
      });
      return;
    }

    // Select appropriate middleware based on complexity tier
    let selectedMiddleware = simpleMiddleware;
    if (tier === COMPLEXITY_TIERS.medium) {
      selectedMiddleware = mediumMiddleware;
    } else if (tier === COMPLEXITY_TIERS.complex) {
      selectedMiddleware = complexMiddleware;
    }

    // Gas is reasonable - proceed with x402 payment flow
    return selectedMiddleware(req, res, next);
  };
}
