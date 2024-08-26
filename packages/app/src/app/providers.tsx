'use client';

import { CacheProvider } from '@chakra-ui/next-js';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { Chakra as ChakraProvider } from '~/lib/components/Chakra';
import { colors } from '~/lib/styles/theme/colors';

const queryClient = new QueryClient();

export const cannon = defineChain({
  id: 13370,
  name: 'Cannon',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: { default: { http: ['http://localhost:8545'] } },
});

// Create the configuration
const config = createConfig({
  ssr: true,
  chains: [cannon, sepolia],
  connectors: [injected()],
  transports: {
    [cannon.id]: http('http://localhost:8545'),
    [sepolia.id]: http(
      process.env.NEXT_PUBLIC_INFURA_API_KEY
        ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
        : 'https://ethereum-sepolia-rpc.publicnode.com'
    ),
  },
});

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
