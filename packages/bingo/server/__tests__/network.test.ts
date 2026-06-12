import { describe, expect, it } from 'vitest';
import {
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { NETWORK_CONFIG, resolveNetwork } from '../network.js';

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
    expect(() => resolveNetwork('mainnet')).toThrow(/NETWORK/);
    expect(() => resolveNetwork('production')).toThrow(/NETWORK/);
  });
});

describe('NETWORK_CONFIG', () => {
  it('staging points at Ethereal testnet with the staging relayer', () => {
    const cfg = NETWORK_CONFIG.staging;
    expect(cfg.chain.id).toBe(CHAIN_ID_ETHEREAL_TESTNET);
    expect(cfg.relayerWsUrl).toBe('wss://relayer.staging.sapience.xyz/auction');
    // BingoCardReceipt (multi-card) deploy block — staging scans need no env.
    expect(cfg.defaultLogFromBlock).toBe(4828264);
  });

  it('main points at Ethereal mainnet with the production relayer', () => {
    const cfg = NETWORK_CONFIG.main;
    expect(cfg.chain.id).toBe(CHAIN_ID_ETHEREAL);
    expect(cfg.relayerWsUrl).toBe('wss://relayer.sapience.xyz/auction');
    // BingoCardReceipt mainnet deploy block (0xdb89…732d, 2026-06-12).
    expect(cfg.defaultLogFromBlock).toBe(5041801);
  });
});
