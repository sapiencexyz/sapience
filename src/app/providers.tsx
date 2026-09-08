'use client';

import { WagmiProvider, createConfig, createStorage } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import type { Chain } from 'viem/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

import type React from 'react';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { hashFn } from 'wagmi/query';
import { resolveChainsAndRpcUrls } from './providers.chains';
import { readCustomChainOverride } from '~/lib/sdk/constants';
import '~/lib/config/registerGraphqlResolver';
import { httpWithRetry } from '~/lib/utils/util';
import ThemeProvider from '~/lib/context/ThemeProvider';
import { SettingsProvider } from '~/lib/context/SettingsContext';
import { ConnectDialogProvider } from '~/lib/context/ConnectDialogContext';
import { AuthProvider } from '~/lib/context/AuthContext';

const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: hashFn,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// Build chains and transports
const buildChainsAndTransports = () => {
  // Custom-chain override (client only): register the user-supplied chain so the
  // app can read/transact on it and `switchChain` resolves instead of erroring.
  // For a built-in chain (e.g. Robinhood/Meridian mainnet) the override repoints
  // that chain's transport at the user-supplied RPC — see resolveChainsAndRpcUrls.
  const override =
    typeof window !== 'undefined' ? readCustomChainOverride() : null;
  const { chains, rpcUrls } = resolveChainsAndRpcUrls(override);

  const transports: Record<number, HttpTransport> = Object.fromEntries(
    Object.entries(rpcUrls).map(([id, url]) => [Number(id), httpWithRetry(url)])
  );

  return { chains, transports };
};

const { chains, transports } = buildChainsAndTransports();

// Create wagmi config once at module level for stable reference
// This ensures wallet connections persist across page refreshes
const wagmiConfig = createConfig({
  ssr: true,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
  chains: chains as unknown as readonly [Chain, ...Chain[]],
  connectors:
    typeof window !== 'undefined'
      ? [
          injected(),
          coinbaseWallet({
            appName: 'Sapience',
          }),
          // Registered only when a project id is configured. Passing an empty
          // one still surfaces WalletConnect in the connect dialog, where
          // choosing it dead-ends on Reown's "Project ID Not Configured".
          ...(WALLETCONNECT_PROJECT_ID
            ? [
                walletConnect({
                  projectId: WALLETCONNECT_PROJECT_ID,
                  metadata: {
                    name: 'Sapience',
                    description: 'Prediction markets on Ethereum',
                    url: 'https://sapience.xyz',
                    icons: ['https://sapience.xyz/logo.svg'],
                  },
                  showQrModal: true,
                }),
              ]
            : []),
        ]
      : [],
  transports,
  pollingInterval: 5_000,
});

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
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
            <WagmiProvider config={wagmiConfig}>
              <ConnectDialogProvider>{children}</ConnectDialogProvider>
            </WagmiProvider>
          </AuthProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default Providers;
