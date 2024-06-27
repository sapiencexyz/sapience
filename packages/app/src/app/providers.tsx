'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import { Chakra as ChakraProvider } from '~/lib/components/Chakra';
import { colors } from '~/lib/styles/theme/colors';

const queryClient = new QueryClient();

const config =
  process.env.NODE_ENV === 'development'
    ? createConfig({
        ssr: true,
        chains: [hardhat],
        connectors: [injected()],
        transports: {
          [hardhat.id]: http('http://localhost:8545'),
        },
      })
    : {};

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <CacheProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={lightTheme({
              accentColor: colors?.gray ? colors.gray[800] : '#00000',
            })}
          >
            <ChakraProvider>{children}</ChakraProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </CacheProvider>
  );
};

export default Providers;
