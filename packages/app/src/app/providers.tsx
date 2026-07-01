'use client';

import { WagmiProvider, createConfig, createStorage } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { HttpTransport } from 'viem';
import type { Chain } from 'viem/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

import type React from 'react';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { hashFn } from 'wagmi/query';
import { readCustomChainOverride } from '@sapience/sdk/constants';
import { resolveChainsAndRpcUrls } from './providers.chains';
import { httpWithRetry } from '~/lib/utils/util';
import { SapienceProvider } from '~/lib/context/SapienceProvider';
import ThemeProvider from '~/lib/context/ThemeProvider';
import { CreatePositionProvider } from '~/lib/context/CreatePositionContext';
import { SettingsProvider } from '~/lib/context/SettingsContext';
import { ConnectDialogProvider } from '~/lib/context/ConnectDialogContext';
import { FundDialogProvider } from '~/lib/context/FundDialogContext';
import { AuthProvider } from '~/lib/context/AuthContext';
import { SessionProvider } from '~/lib/context/SessionContext';

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
          walletConnect({
            projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
            metadata: {
              name: 'Sapience',
              description: 'Prediction markets on Ethereum',
              url: 'https://sapience.xyz',
              icons: ['https://sapience.xyz/logo.svg'],
            },
            showQrModal: true,
          }),
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
              <SessionProvider>
                <SapienceProvider>
                  <ConnectDialogProvider>
                    <FundDialogProvider>
                      <CreatePositionProvider>
                        {children}
                      </CreatePositionProvider>
                    </FundDialogProvider>
                  </ConnectDialogProvider>
                </SapienceProvider>
              </SessionProvider>
            </WagmiProvider>
          </AuthProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default Providers;
