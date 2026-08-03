import { type Chain } from 'viem/chains';
import {
  buildCustomChain,
  robinhoodMainnetChain,
  robinhoodTestnetChain,
} from '@sapience/sdk/constants';

export type CustomChainOverride = { chainId: number; rpcUrl: string } | null;

/**
 * Resolve the wagmi chain list and the RPC URL to use for each chain.
 *
 * A custom-chain override entered in Settings (persisted to localStorage and
 * read via `readCustomChainOverride`) must win even when it targets a built-in
 * chain like Robinhood/Meridian mainnet. Otherwise the wagmi transport keeps
 * pointing at the hardcoded default RPC and the app ignores the user's endpoint —
 * exactly the bug where a custom Alchemy RPC still hit rpc.mainnet.chain.robinhood.com.
 */
export function resolveChainsAndRpcUrls(override: CustomChainOverride): {
  chains: Chain[];
  rpcUrls: Record<number, string>;
} {
  const rpcUrls: Record<number, string> = {
    [robinhoodMainnetChain.id]: robinhoodMainnetChain.rpcUrls.default.http[0],
    [robinhoodTestnetChain.id]: robinhoodTestnetChain.rpcUrls.default.http[0],
  };

  const chains: Chain[] = [robinhoodMainnetChain, robinhoodTestnetChain];

  if (override) {
    // Register a genuinely new chain so `switchChain` resolves instead of
    // erroring; a built-in chain keeps its existing definition. Either way,
    // repoint its transport at the user-supplied RPC so a custom RPC set in
    // Settings actually takes effect.
    if (!chains.some((c) => c.id === override.chainId)) {
      chains.push(buildCustomChain(override.chainId, override.rpcUrl));
    }
    rpcUrls[override.chainId] = override.rpcUrl;
  }

  return { chains, rpcUrls };
}
