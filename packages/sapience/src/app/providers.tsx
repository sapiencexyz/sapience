'use client';

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { base, cannon, sepolia, type Chain } from 'viem/chains';
import { http, useAccount, useSwitchChain } from 'wagmi';

import { SapienceProvider } from '~/lib/context/SapienceProvider';
import ThemeProvider from '~/lib/context/ThemeProvider';
import { createPaymasterConfig } from '~/lib/paymaster';

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

// Create the configuration with paymaster support
const config = createPaymasterConfig([
  base,
  ...(process.env.NODE_ENV !== 'production'
    ? [cannonAtLocalhost, sepolia]
    : []),
] as const);

// NetworkSwitcher component to handle automatic network switching
const NetworkSwitcher = () => {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { ready, authenticated } = usePrivy();
  console.log('chain', chain);

  // Only attempt to switch chains if Privy is ready and user is authenticated
  if (ready && authenticated) {
    // Switch to Base network when connected to a different network
    if (chain && chain.id !== base.id) {
      const switchToBase = async () => {
        try {
          await switchChain({ chainId: base.id });
        } catch (error: unknown) {
          // If the chain hasn't been added to MetaMask, add it
          if ((error as { code: number }).code === 4902) {
            try {
              await window.ethereum?.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: `0x${base.id.toString(16)}`,
                    chainName: base.name,
                    nativeCurrency: base.nativeCurrency,
                    rpcUrls: [base.rpcUrls.default.http[0]],
                    blockExplorerUrls: [base.blockExplorers?.default.url],
                  },
                ],
              });
            } catch (addError) {
              console.error('Error adding Base network:', addError);
            }
          }
        }
      };

      void switchToBase();
    }
  }

  return null;
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
        defaultChain: base,
        supportedChains: [base],
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
            {/* <NetworkSwitcher /> */}
            <SapienceProvider>{children}</SapienceProvider>
          </WagmiProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
};

export default Providers;
