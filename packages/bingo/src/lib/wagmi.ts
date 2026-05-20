import { createConfig, createStorage, http } from 'wagmi';
import { type Chain, arbitrum, base, bsc, mainnet } from 'viem/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import {
  etherealChain,
  etherealTestnetChain,
  hyperEvmChain,
} from '@sapience/sdk/constants';

// Use CORS-friendly public RPCs (viem's defaults like eth.merkle.io block
// browser CORS). These match the URLs the main app falls back to when there's
// no NEXT_PUBLIC_INFURA_API_KEY configured.
const transports = {
  [arbitrum.id]: http('https://arbitrum-rpc.publicnode.com'),
  [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
  [base.id]: http('https://base-rpc.publicnode.com'),
  [bsc.id]: http('https://bsc-rpc.publicnode.com'),
  [hyperEvmChain.id]: http(hyperEvmChain.rpcUrls.default.http[0]),
  [etherealChain.id]: http(etherealChain.rpcUrls.default.http[0]),
  [etherealTestnetChain.id]: http(etherealTestnetChain.rpcUrls.default.http[0]),
} as const;

const chains: readonly [Chain, ...Chain[]] = [
  etherealChain,
  arbitrum,
  mainnet,
  base,
  bsc,
  hyperEvmChain,
  etherealTestnetChain,
];

export const wagmiConfig = createConfig({
  chains,
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
  connectors:
    typeof window !== 'undefined'
      ? [
          injected(),
          coinbaseWallet({ appName: 'Sapience Bingo' }),
        ]
      : [],
  transports,
  pollingInterval: 5_000,
});
