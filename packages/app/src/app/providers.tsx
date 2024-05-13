'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import { Chakra as ChakraProvider } from '~/lib/components/Chakra';

const queryClient = new QueryClient();

hardhat.id = 13370;
const config =
  process.env.NODE_ENV === 'development'
    ? createConfig({
        ssr: true,
        chains: [hardhat],
        connectors: [injected()],
        transports: {
          [hardhat.id]: http('http://localhost:3001'),
        },
      })
    : {};

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
