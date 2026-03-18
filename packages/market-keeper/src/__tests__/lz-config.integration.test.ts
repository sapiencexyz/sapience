/**
 * Integration test: verifies that ConditionalTokensReader (Polygon) and
 * ConditionalTokensConditionResolver (Ethereal) are mutually configured via
 * LayerZero — i.e. each contract's BridgeConfig points at the other, and each
 * OApp peer entry authorises the other contract's address.
 *
 * Requires POLYGON_RPC_URL to be set; skipped otherwise.
 */
import { describe, it, expect } from 'vitest';
import { createPublicClient, http, getAddress } from 'viem';
import {
  conditionalTokensConditionResolver,
  conditionalTokensReader,
} from '@sapience/sdk/contracts';

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
const ETHEREAL_RPC = 'https://rpc.ethereal.trade';

const CHAIN_ID_ETHEREAL = 5064014;
const CHAIN_ID_POLYGON = 137;

const RESOLVER_ADDRESS = getAddress(
  conditionalTokensConditionResolver[CHAIN_ID_ETHEREAL]!.address
);
const READER_ADDRESS = getAddress(
  conditionalTokensReader[CHAIN_ID_POLYGON]!.address
);

const getBridgeConfigAbi = [
  {
    type: 'function',
    name: 'getBridgeConfig',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'remoteEid', type: 'uint32' },
          { name: 'remoteBridge', type: 'address' },
        ],
      },
    ],
  },
] as const;

const peersAbi = [
  {
    type: 'function',
    name: 'peers',
    stateMutability: 'view',
    inputs: [{ name: 'eid', type: 'uint32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const;

describe.skipIf(!POLYGON_RPC_URL)(
  'LayerZero config cross-check (integration)',
  () => {
    // http() throws if URL is undefined even inside a skipped describe,
    // so guard with a fallback placeholder that's never actually used.
    const polygonClient = createPublicClient({
      transport: http(POLYGON_RPC_URL || 'http://localhost'),
    });

    const etherealChain = {
      id: CHAIN_ID_ETHEREAL,
      name: 'Ethereal',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [ETHEREAL_RPC] } },
    } as const;

    const etherealClient = createPublicClient({
      chain: etherealChain,
      transport: http(ETHEREAL_RPC),
    });

    it('ConditionalTokensReader (Polygon) remoteBridge points to ConditionalTokensConditionResolver (Ethereal)', async () => {
      const config = await polygonClient.readContract({
        address: READER_ADDRESS,
        abi: getBridgeConfigAbi,
        functionName: 'getBridgeConfig',
      });

      expect(getAddress(config.remoteBridge)).toBe(RESOLVER_ADDRESS);
    });

    it('ConditionalTokensConditionResolver (Ethereal) remoteBridge points to ConditionalTokensReader (Polygon)', async () => {
      const config = await etherealClient.readContract({
        address: RESOLVER_ADDRESS,
        abi: getBridgeConfigAbi,
        functionName: 'getBridgeConfig',
      });

      expect(getAddress(config.remoteBridge)).toBe(READER_ADDRESS);
    });

    it('ConditionalTokensReader (Polygon) OApp peer for Ethereal LZ EID is ConditionalTokensConditionResolver', async () => {
      const readerConfig = await polygonClient.readContract({
        address: READER_ADDRESS,
        abi: getBridgeConfigAbi,
        functionName: 'getBridgeConfig',
      });

      // readerConfig.remoteEid is the Ethereal LZ EID
      const peer = await polygonClient.readContract({
        address: READER_ADDRESS,
        abi: peersAbi,
        functionName: 'peers',
        args: [readerConfig.remoteEid],
      });

      // OApp stores peers as bytes32-padded address (left-zero-padded); slice last 20 bytes to compare
      expect(getAddress(`0x${peer.slice(-40)}`)).toBe(RESOLVER_ADDRESS);
    });

    it('ConditionalTokensConditionResolver (Ethereal) OApp peer for Polygon LZ EID is ConditionalTokensReader', async () => {
      const resolverConfig = await etherealClient.readContract({
        address: RESOLVER_ADDRESS,
        abi: getBridgeConfigAbi,
        functionName: 'getBridgeConfig',
      });

      // resolverConfig.remoteEid is the Polygon LZ EID
      const peer = await etherealClient.readContract({
        address: RESOLVER_ADDRESS,
        abi: peersAbi,
        functionName: 'peers',
        args: [resolverConfig.remoteEid],
      });

      expect(getAddress(`0x${peer.slice(-40)}`)).toBe(READER_ADDRESS);
    });
  }
);
