'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { HttpTransport } from 'viem';
import { base, cannon, sepolia, type Chain } from 'viem/chains';
import { http, useAccount, useSwitchChain } from 'wagmi';
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

// Use mutable array type Chain[] initially
const chains: Chain[] = [base];

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

// NetworkSwitcher component to automatically switch to base chain
const NetworkSwitcher = () => {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    // Only attempt to switch if user is connected and not already on base
    if (isConnected && chainId && chainId !== base.id) {
      console.log(
        `Current chain: ${chainId}, switching to base chain: ${base.id}`
      );

      try {
        switchChain({ chainId: base.id });
      } catch (error) {
        console.warn('Failed to automatically switch to base chain:', error);
      }
    }
  }, [chainId, isConnected, switchChain]);

  return null; // This component doesn't render anything
};

const Providers = ({ children }: { children: JSX.Element }) => {
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
            <NetworkSwitcher />
            <SapienceProvider>{children}</SapienceProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
};

export default Providers;
