import { createConfig, createStorage, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { etherealChain, etherealTestnetChain } from '@sapience/sdk/constants';
import type { Chain } from 'viem';

export const wagmiConfig = createConfig({
  chains: [etherealChain as Chain, etherealTestnetChain as Chain],
  connectors: [injected()],
  transports: {
    [etherealChain.id]: http(),
    [etherealTestnetChain.id]: http(),
  },
  storage: createStorage({ storage: window.localStorage }),
});
