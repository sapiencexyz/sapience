import { describe, it, expect } from 'vitest';
import {
  robinhoodMainnetChain,
  robinhoodTestnetChain,
} from '@sapience/sdk/constants';

import { resolveChainsAndRpcUrls } from '../providers.chains';

describe('resolveChainsAndRpcUrls', () => {
  it('uses the built-in Robinhood mainnet RPC when there is no override', () => {
    const { rpcUrls } = resolveChainsAndRpcUrls(null);
    expect(rpcUrls[robinhoodMainnetChain.id]).toBe(
      robinhoodMainnetChain.rpcUrls.default.http[0]
    );
  });

  it('repoints a built-in chain transport at a custom RPC override', () => {
    // Regression: a custom RPC entered in Settings for Robinhood Mainnet must
    // win over the hardcoded default, even though 4663 is already a built-in.
    const custom = 'https://robinhood-mainnet.g.alchemy.com/v2/test-key';
    const { chains, rpcUrls } = resolveChainsAndRpcUrls({
      chainId: robinhoodMainnetChain.id,
      rpcUrl: custom,
    });

    expect(rpcUrls[robinhoodMainnetChain.id]).toBe(custom);
    // Must not duplicate the built-in chain entry.
    expect(
      chains.filter((c) => c.id === robinhoodMainnetChain.id)
    ).toHaveLength(1);
  });

  it('honors a custom RPC override for the built-in testnet chain too', () => {
    const custom = 'https://robinhood-testnet.example/v2/test-key';
    const { rpcUrls } = resolveChainsAndRpcUrls({
      chainId: robinhoodTestnetChain.id,
      rpcUrl: custom,
    });
    expect(rpcUrls[robinhoodTestnetChain.id]).toBe(custom);
  });

  it('registers a brand-new chain for an override we do not already ship', () => {
    const custom = 'https://rpc.example.test';
    const { chains, rpcUrls } = resolveChainsAndRpcUrls({
      chainId: 987654,
      rpcUrl: custom,
    });
    expect(rpcUrls[987654]).toBe(custom);
    expect(chains.some((c) => c.id === 987654)).toBe(true);
  });
});
