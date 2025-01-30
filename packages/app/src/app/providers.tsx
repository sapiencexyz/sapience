'use client';

import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { createPublicClient } from 'viem';
import type { Chain, HttpTransport } from 'viem';
import { sepolia, base, mainnet, cannon } from 'viem/chains';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { injected } from 'wagmi/connectors';

import ThemeProvider from '~/components/ThemeProvider';
import { ConnectWalletProvider } from '~/lib/context/ConnectWalletProvider';
import { MarketListProvider } from '~/lib/context/MarketListProvider';

const queryClient = new QueryClient();

// Mainnet client for ENS resolution and stEthPerToken query
export const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

const cannonAtLocalhost = {
  ...cannon,
  rpcUrls: {
    ...cannon.rpcUrls,
    default: { http: ['http://localhost:8545'] },
  },
};

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
};

const chains: any = [base];

if (process.env.NODE_ENV !== 'production') {
  transports[cannonAtLocalhost.id] = http('http://localhost:8545');
  chains.push(cannonAtLocalhost);
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
          <RainbowKitProvider
            theme={lightTheme()}
            initialChain={chains.reduce((a: Chain, b: Chain) =>
              a.id > b.id ? a : b
            )}
          >
            <ConnectWalletProvider>
              <MarketListProvider>{children}</MarketListProvider>
            </ConnectWalletProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
};

export default Providers;
