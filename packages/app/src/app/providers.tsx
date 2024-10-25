'use client';

import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { defineChain } from 'viem';
import { sepolia } from 'viem/chains';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';

import ChakraProvider from '~/components/ui/provider';
import { MarketListProvider } from '~/lib/context/MarketListProvider';
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

const transports: Record<number, HttpTransport> = {
  [sepolia.id]: http(
    process.env.NEXT_PUBLIC_INFURA_API_KEY
      ? `https://sepolia.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      : 'https://ethereum-sepolia-rpc.publicnode.com'
  ),
};

const chains: any = [sepolia];

if (process.env.NODE_ENV !== 'production') {
  transports[cannon.id] = http('http://localhost:8545');
  chains.push(cannon);
}

// Create the configuration
const config = createConfig({
  ssr: true,
  chains,
  connectors: [injected()],
  transports,
});

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: colors?.gray ? colors.gray[800].value : '#00000',
          })}
        >
          <MarketListProvider>
            <ChakraProvider>{children}</ChakraProvider>
          </MarketListProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default Providers;
