'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import { sepolia, base, cannon, type Chain, arbitrum } from 'viem/chains';
import { http } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';

import type React from 'react';
import { useMemo } from 'react';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { hashFn } from 'wagmi/query';
import { SapienceProvider } from '~/lib/context/SapienceProvider';
import ThemeProvider from '~/lib/context/ThemeProvider';
import { CreatePositionProvider } from '~/lib/context/CreatePositionContext';
import { SettingsProvider } from '~/lib/context/SettingsContext';
import { useSettings } from '~/lib/context/SettingsContext';
import { ConnectDialogProvider } from '~/lib/context/ConnectDialogContext';
import { AuthProvider } from '~/lib/context/AuthContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: hashFn,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
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

const ethereal = {
  id: 5064014,
  name: 'Ethereal',
  nativeCurrency: {
    decimals: 18,
    name: 'USDe',
    symbol: 'USDe',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.ethereal.trade'],
    },
    public: {
      http: ['https://rpc.ethereal.trade'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Ethereal Explorer',
      url: 'https://explorer.ethereal.trade',
    },
  },
} as const satisfies Chain;

const useWagmiConfig = () => {
  const { rpcURL: arbitrumRpcUrl } = useSettings();

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
      [ethereal.id]: http('https://rpc.ethereal.trade'),
    };

    const chains: Chain[] = [arbitrum, base, converge, ethereal];

    if (process.env.NODE_ENV !== 'production') {
      transports[cannonAtLocalhost.id] = http('http://localhost:8545');
      chains.push(cannonAtLocalhost);
      chains.push(sepolia);
    }

    return createConfig({
      ssr: true,
      chains: chains as unknown as readonly [Chain, ...Chain[]],
      connectors: [
        injected(),
        coinbaseWallet({
          appName: 'Sapience',
        }),
      ],
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
        appearance: {
          walletChainType: 'ethereum-only',
          walletList: [
            'rabby_wallet',
            'metamask',
            'coinbase_wallet',
            'rainbow',
            'safe',
          ],
        },
      }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        forcedTheme="dark"
        disableTransitionOnChange
      >
        <QueryClientProvider client={queryClient}>
          {process.env.NEXT_PUBLIC_SHOW_REACT_QUERY_DEVTOOLS === 'true' ? (
            <ReactQueryDevtools initialIsOpen={false} />
          ) : null}

          <SettingsProvider>
            <AuthProvider>
              <WagmiRoot>
                <SapienceProvider>
                  <ConnectDialogProvider>
                    <CreatePositionProvider>{children}</CreatePositionProvider>
                  </ConnectDialogProvider>
                </SapienceProvider>
              </WagmiRoot>
            </AuthProvider>
          </SettingsProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </PrivyProvider>
  );
};

export default Providers;
