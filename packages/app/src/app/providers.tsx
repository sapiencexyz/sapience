'use client';

import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { defineChain } from 'viem';
import { sepolia, base, mainnet } from 'viem/chains';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';

import ThemeProvider from '~/components/ThemeProvider';
import { MarketListProvider } from '~/lib/context/MarketListProvider';

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
  [mainnet.id]: http(
    process.env.NEXT_PUBLIC_INFURA_API_KEY
      ? `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      : 'https://ethereum-rpc.publicnode.com'
  ),
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
};

const chains: any = [mainnet, base];

if (process.env.NODE_ENV !== 'production') {
  transports[cannon.id] = http('http://localhost:8545');
  chains.push(cannon);
  chains.push(sepolia);
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
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={lightTheme()}>
            <MarketListProvider>{children}</MarketListProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
};

export default Providers;
