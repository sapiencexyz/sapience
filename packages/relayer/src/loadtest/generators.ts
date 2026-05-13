/**
 * Payload generators — ports the signing flow from ws.e2e.helpers.ts.
 * Generates cryptographically valid AuctionRFQ and Bid payloads.
 */

import {
  buildAuctionIntentTypedData,
  buildCounterpartyMintTypedData,
} from '@sapience/sdk/auction/escrowSigning';
import { predictionMarketEscrow } from '@sapience/sdk/contracts/addresses';
import type { AuctionRFQPayload, BidPayload } from '../escrowTypes';
import type { Address, Hex } from 'viem';
import { OutcomeSide } from '@sapience/sdk/types';
import type { Pick } from '@sapience/sdk/types';
import {
  type LoadTestAccount,
  type AccountPool,
  nextNonce,
  randomPredictor,
} from './accounts';

// Default test values matching e2e helpers
const DEFAULT_CHAIN_ID = 5064014;
const DEFAULT_ESCROW_ADDRESS = predictionMarketEscrow[DEFAULT_CHAIN_ID]
  ?.address as Address;
const DEFAULT_PICK: Pick = {
  conditionResolver: '0x1234567890123456789012345678901234567890' as Address,
  conditionId: ('0x' + 'ab'.repeat(32)) as Hex,
  predictedOutcome: OutcomeSide.YES,
};

export interface AuctionPayloadResult {
  payload: AuctionRFQPayload;
  account: LoadTestAccount;
}

export interface BidPayloadResult {
  payload: BidPayload;
  account: LoadTestAccount;
}

/**
 * Generate a signed AuctionRFQ payload using EIP-712 AuctionIntent.
 */
export async function generateAuctionPayload(
  account: LoadTestAccount,
  opts: {
    chainId?: number;
    escrowAddress?: Address;
    picks?: Pick[];
    collateral?: string;
  } = {}
): Promise<AuctionRFQPayload> {
  const chainId = opts.chainId ?? DEFAULT_CHAIN_ID;
  const escrowAddress = opts.escrowAddress ?? DEFAULT_ESCROW_ADDRESS;
  const picks = opts.picks ?? [DEFAULT_PICK];
  const collateral = opts.collateral ?? '1000000000000000000';
  const nonce = nextNonce(account);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const sdkPicks: Pick[] = picks.map((p) => ({
    conditionResolver: p.conditionResolver,
    conditionId: p.conditionId,
    predictedOutcome: p.predictedOutcome,
  }));

  const typedData = buildAuctionIntentTypedData({
    picks: sdkPicks,
    predictor: account.account.address,
    predictorCollateral: BigInt(collateral),
    predictorNonce: BigInt(nonce),
    predictorDeadline: BigInt(deadline),
    verifyingContract: escrowAddress,
    chainId,
  });

  const intentSignature = await account.account.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    picks: picks.map((p) => ({
      conditionResolver: p.conditionResolver,
      conditionId: p.conditionId,
      predictedOutcome: p.predictedOutcome,
    })),
    predictorCollateral: collateral,
    predictor: account.account.address,
    predictorNonce: nonce,
    predictorDeadline: deadline,
    intentSignature,
    chainId,
    escrowContract: escrowAddress,
  };
}

/**
 * Generate a signed Bid payload using EIP-712 MintApproval.
 */
export async function generateBidPayload(
  account: LoadTestAccount,
  auctionDetails: {
    auctionId: string;
    picks: {
      conditionResolver: string;
      conditionId: string;
      predictedOutcome: number;
    }[];
    predictor: string;
    predictorCollateral: string;
    chainId: number;
    escrowContract?: string;
  },
  opts: {
    escrowAddress?: Address;
    collateral?: string;
  } = {}
): Promise<BidPayload> {
  const escrowAddress =
    opts.escrowAddress ??
    (auctionDetails.escrowContract as Address | undefined) ??
    DEFAULT_ESCROW_ADDRESS;
  const collateral = opts.collateral ?? '500000000000000000';
  const nonce = nextNonce(account);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const sdkPicks: Pick[] = auctionDetails.picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));

  const typedData = buildCounterpartyMintTypedData({
    picks: sdkPicks,
    predictorCollateral: BigInt(auctionDetails.predictorCollateral),
    counterpartyCollateral: BigInt(collateral),
    predictor: auctionDetails.predictor as Address,
    counterparty: account.account.address,
    counterpartyNonce: BigInt(nonce),
    counterpartyDeadline: BigInt(deadline),
    verifyingContract: escrowAddress,
    chainId: auctionDetails.chainId,
  });

  const counterpartySignature = await account.account.signTypedData({
    domain: {
      ...typedData.domain,
      chainId: Number(typedData.domain.chainId),
    },
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  return {
    auctionId: auctionDetails.auctionId,
    counterparty: account.account.address,
    counterpartyCollateral: collateral,
    counterpartyNonce: nonce,
    counterpartyDeadline: deadline,
    counterpartySignature,
  };
}

/**
 * Pre-batch signed payloads to avoid signing becoming a bottleneck during steady state.
 */
export async function preBatchAuctionPayloads(
  pool: AccountPool,
  count: number,
  opts: { chainId?: number; escrowAddress?: Address } = {}
): Promise<AuctionPayloadResult[]> {
  const results: AuctionPayloadResult[] = [];
  const batchSize = 50;

  for (let i = 0; i < count; i += batchSize) {
    const batch = Math.min(batchSize, count - i);
    const promises: Promise<AuctionPayloadResult>[] = [];

    for (let j = 0; j < batch; j++) {
      const account = randomPredictor(pool);
      promises.push(
        generateAuctionPayload(account, opts).then((payload) => ({
          payload,
          account,
        }))
      );
    }

    results.push(...(await Promise.all(promises)));
  }

  return results;
}

/**
 * GraphQL query strings for expensive resolvers.
 */
export const GRAPHQL_QUERIES = {
  protocolStats: `query { protocolStats { totalVolume totalPredictions activePredictions uniqueUsers } }`,
  accountStatsLeaderboard: `query { accountStatsLeaderboard(metric: NET_PNL, limit: 50) { address netPnL gains losses volume } }`,
  conditions: `query { conditions(first: 20) { id resolver conditionId predictions(first: 10) { id predictor counterparty predictorCollateral counterpartyCollateral settled } } }`,
  markets: `query { markets(first: 20) { id title status volume predictions { id } } }`,
  userProfile: `query { user(address: "0x0000000000000000000000000000000000000001") { address predictions { id } profit } }`,
} as const;

export type QueryName = keyof typeof GRAPHQL_QUERIES;
