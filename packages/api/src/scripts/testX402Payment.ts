/**
 * x402 End-to-End Test Payment Script
 *
 * Tests the full payment flow against the GraphQL API:
 * 1. Tests complexity-based pricing with different query types
 * 2. Exhausts free tier (200 requests - should succeed)
 * 3. Requests GraphQL without payment (expects 402)
 * 4. Parses payment requirements
 * 5. Signs a USDC payment using a test wallet
 * 6. Retries with signed payment header
 *
 * Prerequisites:
 *   - Facilitator running on port 4021: `pnpm dev:facilitator`
 *   - API server running on port 3001: `pnpm dev:service`
 *   - X402_TEST_WALLET_PRIVATE_KEY set in .env (wallet with USDC on Arbitrum)
 *   - RESTART the API server before each test run to reset rate limiter state
 *     (or wait 60 seconds for the rate limit window to expire)
 *
 * Usage: pnpm test:x402
 */
import { config as dotEnvConfig } from 'dotenv';
import { fromRoot } from '../utils/fromRoot';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import type { PaymentRequired } from '@x402/core/types';

dotEnvConfig({ path: fromRoot('.env') });

const API_URL = process.env.X402_TEST_API_URL || 'http://localhost:3001';
const ENDPOINT = '/graphql';

// Test queries with different complexity levels to verify dynamic pricing
const TEST_QUERIES = {
  simple: {
    name: 'Simple query (complexity 0-1000)',
    expectedPrice: '5000', // $0.005
    body: JSON.stringify({
      query: `
        query {
          conditions(take: 10) {
            id
            createdAt
          }
        }
      `,
    }),
  },
  medium: {
    name: 'Medium query (complexity 1000-5000)',
    expectedPrice: '15000', // $0.015
    body: JSON.stringify({
      query: `
        query {
          protocolStats {
            timestamp
            dailyVolume
          }
          accuracyLeaderboard(limit: 10) {
            address
            accuracyScore
          }
        }
      `,
    }),
  },
  complex: {
    name: 'Complex query (complexity 5000+)',
    expectedPrice: '30000', // $0.03
    body: JSON.stringify({
      query: `
        query {
          a1: protocolStats { timestamp cumulativeVolume }
          a2: protocolStats { timestamp openInterest }
          a3: protocolStats { timestamp vaultBalance }
        }
      `,
    }),
  },
};

// Use simple query for free tier exhaustion
const TEST_QUERY = TEST_QUERIES.simple.body;

async function main() {
  const privateKey = process.env.X402_TEST_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      'X402_TEST_WALLET_PRIVATE_KEY is required. Set it in packages/api/.env'
    );
    process.exit(1);
  }

  const rpcUrl =
    process.env.X402_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';

  // Create wallet client for signing payments
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    chain: arbitrum,
    transport: http(rpcUrl),
    account,
  });

  console.log(`Test wallet: ${account.address}`);
  console.log(`Target: ${API_URL}${ENDPOINT}\n`);

  // Pre-check: Verify rate limiter is not already exhausted
  console.log('Checking rate limiter status...');
  const preCheck = await fetch(`${API_URL}${ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: TEST_QUERY,
  });

  if (preCheck.status === 402) {
    console.error('\n⚠️  ERROR: Rate limiter already exhausted!');
    console.error(
      'The free tier (200 req/min) is already used up from a previous test run.'
    );
    console.error('\nPlease RESTART the API server to reset the rate limiter:');
    console.error('  1. Stop the API server (Ctrl+C)');
    console.error('  2. Run: pnpm dev:service');
    console.error('  3. Wait for it to start, then run this test again\n');
    console.error(
      'Alternatively, wait 60 seconds for the rate limit window to reset.\n'
    );
    process.exit(1);
  }

  console.log(`✓ Rate limiter OK (got ${preCheck.status})\n`);

  // Step 0: Test complexity-based pricing (within free tier)
  console.log('--- Step 0: Testing complexity-based pricing ---');
  console.log(
    'Making 3 test requests to verify dynamic pricing based on query complexity:\n'
  );

  for (const [, queryConfig] of Object.entries(TEST_QUERIES)) {
    const testResponse = await fetch(`${API_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: queryConfig.body,
    });

    if (testResponse.status === 200) {
      console.log(`✓ ${queryConfig.name}`);
      console.log(`  Status: 200 OK (within free tier)`);
      console.log(
        `  Expected price when payment required: $${Number(queryConfig.expectedPrice) / 1000000} (${queryConfig.expectedPrice} USDC)\n`
      );
    } else {
      console.error(`✗ ${queryConfig.name}`);
      console.error(`  Expected 200, got ${testResponse.status}\n`);
    }
  }

  // Step 1: Exhaust free tier (196 more requests = 200 total including pre-check + Step 0)
  console.log('--- Step 1: Exhausting free tier (196 more requests) ---');
  const remainingFreeRequests = 200 - 1 - 3; // 1 pre-check + 3 in Step 0 = 4 total
  for (let i = 1; i <= remainingFreeRequests; i++) {
    const freeResponse = await fetch(`${API_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: TEST_QUERY,
    });
    if (freeResponse.status !== 200) {
      console.error(
        `Expected 200 for free tier request ${i + 3} (total), got ${freeResponse.status}`
      );
      const body = await freeResponse.text();
      console.error('Body:', body);
      process.exit(1);
    }
    if (i % 50 === 0) {
      console.log(
        `  ${i + 3}/200 free requests completed (${i}/${remainingFreeRequests} in this step)`
      );
    }
  }
  console.log(`Free tier exhausted (200/200 total)\n`);

  // Step 2: Request 201 without payment — expect 402
  console.log('--- Step 2: Request without payment (after free tier) ---');
  const initialResponse = await fetch(`${API_URL}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: TEST_QUERY,
  });
  console.log(`Status: ${initialResponse.status}`);

  if (initialResponse.status !== 402) {
    console.error(
      `Expected 402 Payment Required, got ${initialResponse.status}. Is x402 middleware enabled?`
    );
    const body = await initialResponse.text();
    console.error('Response body:', body);
    process.exit(1);
  }

  // Parse payment requirements from response
  const paymentRequiredHeader = initialResponse.headers.get('payment-required');
  const responseBody = await initialResponse.json();

  let paymentRequired: PaymentRequired;
  if (paymentRequiredHeader) {
    paymentRequired = JSON.parse(
      Buffer.from(paymentRequiredHeader, 'base64').toString()
    );
  } else {
    paymentRequired = responseBody as PaymentRequired;
  }

  console.log('Payment requirements received:');
  console.log(`  Version: ${paymentRequired.x402Version}`);
  if (paymentRequired.accepts?.length > 0) {
    const req = paymentRequired.accepts[0];
    console.log(`  Network: ${req.network}`);
    console.log(`  Asset: ${req.asset}`);
    console.log(`  Amount: ${req.amount}`);
    console.log(`  PayTo: ${req.payTo}`);
    console.log(`  Extra: ${JSON.stringify(req.extra, null, 2)}`);
  }
  console.log('\nFull payment requirements:');
  console.log(JSON.stringify(paymentRequired, null, 2));
  console.log();

  // Step 3: Create x402 client and sign payment
  console.log('--- Step 3: Signing payment ---');
  const evmSigner = toClientEvmSigner({
    address: account.address,
    signTypedData: (message) =>
      walletClient.signTypedData(
        message as Parameters<typeof walletClient.signTypedData>[0]
      ),
  });

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: evmSigner });
  const httpClient = new x402HTTPClient(client);

  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);

  console.log('Payment signed successfully');
  console.log(`  Header keys: ${Object.keys(headers).join(', ')}\n`);

  // Step 4: Retry with payment
  console.log('--- Step 4: Retrying with payment ---');
  const paidResponse = await fetch(`${API_URL}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: TEST_QUERY,
  });

  console.log(`Status: ${paidResponse.status}`);

  const paidBody = await paidResponse.json();
  console.log('GraphQL Response:', JSON.stringify(paidBody, null, 2));

  // Check for settlement response
  const settlementHeader = paidResponse.headers.get('x-payment-response');
  if (settlementHeader) {
    const settlement = JSON.parse(
      Buffer.from(settlementHeader, 'base64').toString()
    );
    console.log('\nSettlement:', JSON.stringify(settlement, null, 2));
  }

  if (!paidResponse.ok) {
    console.error('\nPayment was not accepted.');
    process.exit(1);
  }

  console.log('\n✓ x402 payment flow completed successfully!');

  // Step 5: Test complexity-based pricing with actual payments
  console.log(
    '\n--- Step 5: Testing complexity-based pricing with different queries ---'
  );

  for (const [tier, queryConfig] of Object.entries(TEST_QUERIES)) {
    console.log(`\nTesting ${tier} tier: ${queryConfig.name}`);

    // Request without payment to get pricing
    const pricingResponse = await fetch(`${API_URL}${ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: queryConfig.body,
    });

    if (pricingResponse.status === 402) {
      const paymentHeader = pricingResponse.headers.get('payment-required');
      if (paymentHeader) {
        const pricing = JSON.parse(
          Buffer.from(paymentHeader, 'base64').toString()
        );
        const actualPrice = pricing.accepts[0].amount;
        const priceUSD = Number(actualPrice) / 1000000;

        console.log(
          `  Expected price: $${Number(queryConfig.expectedPrice) / 1000000} (${queryConfig.expectedPrice} USDC)`
        );
        console.log(`  Actual price:   $${priceUSD} (${actualPrice} USDC)`);

        if (actualPrice === queryConfig.expectedPrice) {
          console.log(`  ✓ Pricing matches expected tier`);
        } else {
          console.log(`  ⚠ Pricing differs (complexity may vary)`);
        }

        // Sign and pay
        const paymentPayload = await httpClient.createPaymentPayload(pricing);
        const paymentHeaders =
          httpClient.encodePaymentSignatureHeader(paymentPayload);

        const paidResponse = await fetch(`${API_URL}${ENDPOINT}`, {
          method: 'POST',
          headers: {
            ...paymentHeaders,
            'Content-Type': 'application/json',
          },
          body: queryConfig.body,
        });

        if (paidResponse.ok) {
          console.log(`  ✓ Payment accepted and query executed successfully`);
        } else {
          console.log(`  ✗ Payment rejected: ${paidResponse.status}`);
        }
      }
    } else {
      console.log(`  ✗ Expected 402, got ${pricingResponse.status}`);
    }
  }

  console.log('\n✓ All complexity-based pricing tests completed!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
