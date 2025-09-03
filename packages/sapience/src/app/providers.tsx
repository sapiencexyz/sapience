'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { sepolia, base, cannon, type Chain, arbitrum } from 'viem/chains';
import { http } from 'wagmi';
import { injected } from 'wagmi/connectors';

import type React from 'react';
import { useMemo } from 'react';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { hashFn } from 'wagmi/query';
import { SapienceProvider } from '~/lib/context/SapienceProvider';
import ThemeProvider from '~/lib/context/ThemeProvider';
import { BetSlipProvider } from '~/lib/context/BetSlipContext';
import { SettingsProvider } from '~/lib/context/SettingsContext';
import { useSettings } from '~/lib/context/SettingsContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: hashFn,
    },
  },
});

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

const useWagmiConfig = () => {
  const { arbitrumRpcUrl } = useSettings();

  const config = useMemo(() => {
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
      [arbitrum.id]: http(
        arbitrumRpcUrl ||
          (process.env.NEXT_PUBLIC_INFURA_API_KEY
            ? `https://arbitrum-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
            : 'https://arbitrum-rpc.publicnode.com')
      ),
      [converge.id]: http(process.env.NEXT_PUBLIC_RPC_URL || ''),
    };

    const chains: Chain[] = [arbitrum, base, converge];

    if (process.env.NODE_ENV !== 'production') {
      transports[cannonAtLocalhost.id] = http('http://localhost:8545');
      chains.push(cannonAtLocalhost);
      chains.push(sepolia);
    }

    return createConfig({
      ssr: true,
      chains: chains as unknown as readonly [Chain, ...Chain[]],
      connectors: [injected()],
      transports,
    });
  }, [arbitrumRpcUrl]);

  return config;
};

const WagmiRoot = ({ children }: { children: React.ReactNode }) => {
  const config = useWagmiConfig();
  return <WagmiProvider config={config}>{children}</WagmiProvider>;
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
      config={{
        defaultChain: arbitrum,
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          <ReactQueryDevtools initialIsOpen={false} />

          <SettingsProvider>
            <WagmiRoot>
              <SapienceProvider>
                <BetSlipProvider>{children}</BetSlipProvider>
              </SapienceProvider>
            </WagmiRoot>
          </SettingsProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
};

export default Providers;
