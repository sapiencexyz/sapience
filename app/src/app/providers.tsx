'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import { Chakra as ChakraProvider } from '~/lib/components/Chakra';

const queryClient = new QueryClient();

const config = createConfig({
  ssr: true,
  chains: [base],
  connectors: [injected()],
  transports: {
    [base.id]:
      process.env.NODE_ENV === 'development'
        ? http('http://127.0.0.1:8545')
        : http('https://mainnet.base.org'),
  },
});

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <CacheProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <ChakraProvider>{children}</ChakraProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </CacheProvider>
  );
};

export default Providers;
