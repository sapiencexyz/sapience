import { describe, expect, it } from 'vitest';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import {
  NETWORK_CONFIG,
  networkForChainId,
  resolveNetwork,
} from '../network.js';

describe('resolveNetwork', () => {
  it('defaults to staging when unset or empty', () => {
    expect(resolveNetwork(undefined)).toBe('staging');
    expect(resolveNetwork('')).toBe('staging');
  });

  it('accepts the two valid networks', () => {
    expect(resolveNetwork('staging')).toBe('staging');
    expect(resolveNetwork('main')).toBe('main');
  });

  it('rejects anything else instead of silently falling back', () => {
    expect(() => resolveNetwork('mainnet')).toThrow(/network/i);
    expect(() => resolveNetwork('production')).toThrow(/network/i);
  });
});

describe('networkForChainId', () => {
  it('maps each chain to its network', () => {
    expect(networkForChainId(CHAIN_ID_ETHEREAL)).toBe('main');
    expect(networkForChainId(CHAIN_ID_ETHEREAL_TESTNET)).toBe('staging');
  });

  it('returns null for unknown chains', () => {
    expect(networkForChainId(1)).toBeNull();
    expect(networkForChainId(0)).toBeNull();
  });
});

describe('NETWORK_CONFIG', () => {
  it('staging points at Ethereal testnet with the staging deployment', () => {
    const cfg = NETWORK_CONFIG.staging;
    expect(cfg.chain.id).toBe(CHAIN_ID_ETHEREAL_TESTNET);
    expect(cfg.relayerWsUrl).toBe('wss://relayer.staging.sapience.xyz/auction');
    // BingoCardReceipt (multi-card) on Ethereal testnet, 2026-06-11.
    expect(cfg.receiptContract).toBe(
      '0x67fB8B733Fe4E523d7d491785A86748a4ee9112c',
    );
    expect(cfg.logFromBlock).toBe(4828264);
  });

  it('main points at Ethereal mainnet with the production deployment', () => {
    const cfg = NETWORK_CONFIG.main;
    expect(cfg.chain.id).toBe(CHAIN_ID_ETHEREAL);
    expect(cfg.relayerWsUrl).toBe('wss://relayer.sapience.xyz/auction');
    // BingoCardReceipt on Ethereal mainnet, 2026-06-12.
    expect(cfg.receiptContract).toBe(
      '0xdb89F60983C7f943FD683Da0c3F6418d38e3732d',
    );
    expect(cfg.logFromBlock).toBe(5041801);
  });
});
