/**
 * CT (ConditionalTokens) settlement handler.
 *
 * Checks if a condition is resolved on Polymarket (Polygon) via ConditionalTokensReader,
 * then bridges the resolution to Ethereal via LayerZero requestResolution().
 */

import {
  createPublicClient,
  http,
  formatEther,
  defineChain,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
  type Account,
} from 'viem';
import { conditionalTokensConditionResolver } from '@sapience/sdk';
import {
  createPolygonClient,
  createPolygonWalletClient,
  canRequestResolution as checkCanRequestResolution,
  requestResolution as sendRequestResolution,
} from '../polygon/client.js';
import type {
  CLIOptions,
  SapienceCondition,
  SettlementHandler,
  SettlementResult,
} from './types.js';

// ============ Constants ============

const CHAIN_ID = Number(process.env.CHAIN_ID || '5064014');

const RESOLVER_ADDRESS = (process.env.RESOLVER_ADDRESS ||
  conditionalTokensConditionResolver[CHAIN_ID]?.address) as Address;

const ETHEREAL_RPC =
  process.env.ETHEREAL_RPC_URL || 'https://rpc.ethereal.trade';

// ============ Chain Definition ============

const etherealChain = defineChain({
  id: CHAIN_ID,
  name: 'Ethereal',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ETHEREAL_RPC] },
  },
});

// ============ ABIs ============

const resolverAbi = [
  {
    type: 'function',
    name: 'getResolution',
    stateMutability: 'view',
    inputs: [{ name: 'conditionId', type: 'bytes' }],
    outputs: [
      { name: 'resolved', type: 'bool' },
      {
        name: 'outcome',
        type: 'tuple',
        components: [
          { name: 'yesWeight', type: 'uint256' },
          { name: 'noWeight', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

// ============ Handler ============

export class CTSettlementHandler implements SettlementHandler {
  readonly name = 'ct';

  private polygonClient!: PublicClient;
  private etherealClient!: PublicClient;
  private walletClient: WalletClient<Transport, Chain, Account> | null = null;

  isConfigured(): boolean {
    const polygonRpcUrl = process.env.POLYGON_RPC_URL;
    if (!polygonRpcUrl) {
      console.log('[ct] POLYGON_RPC_URL not set, CT settlement disabled');
      return false;
    }
    if (!RESOLVER_ADDRESS) {
      console.log(
        `[ct] No ConditionalTokensConditionResolver address for chainId=${CHAIN_ID}`
      );
      return false;
    }
    return true;
  }

  async init(options: CLIOptions): Promise<void> {
    const polygonRpcUrl = process.env.POLYGON_RPC_URL!;
    const privateKey = process.env.ADMIN_PRIVATE_KEY;

    this.polygonClient = createPolygonClient(polygonRpcUrl);

    this.etherealClient = createPublicClient({
      chain: etherealChain,
      transport: http(ETHEREAL_RPC),
    });

    console.log(
      `[ct] Ethereal client connected (chain ${CHAIN_ID}, resolver ${RESOLVER_ADDRESS})`
    );

    if (privateKey && !options.dryRun) {
      this.walletClient = createPolygonWalletClient(polygonRpcUrl, privateKey);

      const balance = await this.polygonClient.getBalance({
        address: this.walletClient.account.address,
      });
      console.log(
        `[ct] Polygon wallet ${this.walletClient.account.address} balance: ${formatEther(balance)} POL`
      );
    }
  }

  async settle(
    condition: SapienceCondition,
    options: CLIOptions
  ): Promise<SettlementResult> {
    const conditionId = condition.id as Hex;

    try {
      // Step 1: Check if already settled on Ethereal
      console.log(`[ct][${conditionId}] Checking resolver...`);
      try {
        const [isResolved] = await this.etherealClient.readContract({
          address: RESOLVER_ADDRESS,
          abi: resolverAbi,
          functionName: 'getResolution',
          args: [conditionId],
        });

        if (isResolved) {
          console.log(`[ct][${conditionId}] Already settled`);
          return {
            conditionId,
            resolverType: 'ct',
            alreadyResolved: true,
            canResolve: false,
            settled: false,
          };
        }
      } catch (err) {
        console.log(
          `[ct][${conditionId}] getResolution reverted (${err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100)}), proceeding to Polygon check`
        );
      }

      // Step 2: Check if resolved on Polygon (ConditionalTokensReader)
      console.log(
        `[ct][${conditionId}] Checking canRequestResolution on Polygon...`
      );
      const canResolve = await checkCanRequestResolution(
        this.polygonClient,
        conditionId
      );

      if (!canResolve) {
        console.log(`[ct][${conditionId}] Not resolved on Polygon yet`);
        return {
          conditionId,
          resolverType: 'ct',
          alreadyResolved: false,
          canResolve: false,
          settled: false,
        };
      }

      if (options.dryRun) {
        console.log(
          `[ct][${conditionId}] DRY RUN — would call requestResolution (LZ bridge)`
        );
        return {
          conditionId,
          resolverType: 'ct',
          alreadyResolved: false,
          canResolve: true,
          settled: false,
        };
      }

      if (!this.walletClient) {
        return {
          conditionId,
          resolverType: 'ct',
          alreadyResolved: false,
          canResolve: true,
          settled: false,
          error: 'No wallet client (missing ADMIN_PRIVATE_KEY)',
        };
      }

      // Step 3: Send requestResolution on Polygon (triggers LZ bridge to Ethereal)
      console.log(`[ct][${conditionId}] Sending requestResolution...`);
      const hash = await sendRequestResolution(
        this.polygonClient,
        this.walletClient,
        conditionId
      );
      console.log(`[ct][${conditionId}] Transaction sent: ${hash}`);

      if (options.wait) {
        console.log(`[ct][${conditionId}] Waiting for confirmation...`);
        const receipt = await this.polygonClient.waitForTransactionReceipt({
          hash,
        });
        console.log(
          `[ct][${conditionId}] Confirmed in block ${receipt.blockNumber}`
        );
      }

      return {
        conditionId,
        resolverType: 'ct',
        alreadyResolved: false,
        canResolve: true,
        settled: true,
        txHash: hash,
      };
    } catch (error) {
      return {
        conditionId,
        resolverType: 'ct',
        alreadyResolved: false,
        canResolve: false,
        settled: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
