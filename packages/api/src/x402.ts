/**
 * x402 payment middleware configuration for the API server.
 *
 * Protects routes behind USDC micropayments on Arbitrum One.
 * Runs the facilitator in-process (no separate service needed).
 * Charges a single bundle price per payment; credits are tracked by
 * the credit session system (see creditSessions.ts).
 */
import { paymentMiddleware } from '@x402/express';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import { registerExactEvmScheme as registerServerEvmScheme } from '@x402/evm/exact/server';
import { x402Facilitator } from '@x402/core/facilitator';
import { registerExactEvmScheme as registerFacilitatorEvmScheme } from '@x402/evm/exact/facilitator';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { config } from './config';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { parse } from 'graphql';
import {
  getComplexity,
  createComplexityEstimators,
} from './graphql/queryComplexity';
import { SharedSchema } from './graphql/sharedSchema';

const NETWORK = 'eip155:42161' as const;
// Native USDC on Arbitrum One (Circle's FiatTokenV2_2, supports EIP-3009)
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

/**
 * Calculate GraphQL query complexity using the same estimators as Apollo validation.
 * The score is used directly as the credit cost for a query (minimum 1).
 */
export function calculateGraphQLComplexity(
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

    return Number.isFinite(complexity) ? complexity : 1;
  } catch (error) {
    console.error('[x402] Error calculating query complexity:', error);
    // On error, return minimum — the query will fail at the GraphQL layer anyway if malformed
    return 1;
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
 * Create x402 middleware for a given USDC price
 */
function createX402PaymentMiddleware(
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
 * Create the x402 payment middleware for credit bundle purchases.
 */
export function createX402Middleware() {
  const server = createX402Server();
  const bundlePrice = config.X402_CREDIT_BUNDLE_USDC;

  return createX402PaymentMiddleware(
    bundlePrice,
    'API access - credit bundle',
    server
  );
}
