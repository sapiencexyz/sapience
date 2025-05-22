import { base } from 'viem/chains';
import { type Config, createConfig, http } from 'wagmi';
import { type Chain } from 'wagmi/chains';

// Pimlico Paymaster configuration
const PIMLICO_PAYMASTER_URL = process.env.NEXT_PUBLIC_PIMLICO_PAYMASTER_URL;

if (!PIMLICO_PAYMASTER_URL) {
  console.warn('PIMLICO_PAYMASTER_URL is not set in environment variables');
}

// Create a custom middleware that adds paymaster data to transactions
const paymasterMiddleware = (config: Config) => {
  return {
    ...config,
    async prepareTransaction(tx: any) {
      // Add paymaster data to the transaction
      return {
        ...tx,
        paymasterAndData: PIMLICO_PAYMASTER_URL,
      };
    },
  };
};

// Create a paymaster-enabled config
export function createPaymasterConfig(chains: readonly [Chain, ...Chain[]]) {
  const config = createConfig({
    chains,
    transports: {
      [base.id]: http(base.rpcUrls.default.http[0]),
    },
  });

  return paymasterMiddleware(config);
}
