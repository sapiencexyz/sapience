'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { sepolia, base, cannon, type Chain } from 'viem/chains';
import { http } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { SapienceProvider } from '~/lib/context/SapienceProvider';
import ThemeProvider from '~/lib/context/ThemeProvider';

const queryClient = new QueryClient();

const cannonAtLocalhost = {
  ...cannon,
  rpcUrls: {
    ...cannon.rpcUrls,
    default: { http: ['http://localhost:8545'] },
  },
};

const converge = {
  id: 432,
  name: 'Converge',
  nativeCurrency: {
    decimals: 18,
    name: 'Converge',
    symbol: 'CONVERGE',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || ''],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || ''],
    },
  },
} as const satisfies Chain;

const transports: Record<number, HttpTransport> = {
  [sepolia.id]: http(
    process.env.NEXT_PUBLIC_INFURA_API_KEY
      ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      : 'https://ethereum-sepolia-rpc.publicnode.com'
  ),
  [base.id]: http(
    process.env.NEXT_PUBLIC_INFURA_API_KEY
      ? `https://base-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      : 'https://base-rpc.publicnode.com'
  ),
  [converge.id]: http(process.env.NEXT_PUBLIC_RPC_URL || ''),
};

// Use mutable array type Chain[] initially
const chains: Chain[] = [base, converge];

if (process.env.NODE_ENV !== 'production') {
  transports[cannonAtLocalhost.id] = http('http://localhost:8545');
  chains.push(cannonAtLocalhost);
  chains.push(sepolia);
}

// Create the configuration
const config = createConfig({
  ssr: true,
  chains: chains as unknown as readonly [Chain, ...Chain[]],
  connectors: [injected()],
  transports,
});

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyProvider
      appId="cm9x5nf6q00gmk10ns01ppicr"
      clientId="client-WY5ixY1AeM6aabHPcJZPirK3j3Cemt2wAotTQ3yeT7bfX"
      config={{
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <SapienceProvider>{children}</SapienceProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
};

export default Providers;
