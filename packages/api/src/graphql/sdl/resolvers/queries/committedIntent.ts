/**
 * Committed-intent queries (PRD-001 §3):
 *
 *   commitment                — single lookup by EIP-712 commitmentHash
 *   commitments               — paginated list, filterable by predictor / status
 *   counterpartyVaultBalance  — derived sum(deposit) − sum(withdraw) − sum(slash)
 *   counterpartyVaultHistory  — vault event history per counterparty
 *   insurancePoolEvents       — paginated funded / drawn pool events
 *
 * Mirrors the type-graphql resolver previously at
 * packages/api/src/graphql/resolvers/CommittedIntentResolver.ts (removed
 * with the SDL-first migration). The SDL types Commitment,
 * CommitmentSlice, CommitmentSlash, CounterpartyVaultEvent, and
 * InsurancePoolEvent are scalar-only object types — Prisma rows are
 * hand-mapped to the SDL shape before return.
 */

import {
  CommitmentStatus,
  type QueryResolvers,
} from '../../__generated__/resolvers';
import prisma from '../../../../core/db';

const VALID_STATUSES = new Set<string>(Object.values(CommitmentStatus));

type CommitmentRow = {
  id: string;
  chainId: number;
  predictor: string;
  pickConfigId: string;
  amountIn: string;
  minFillIn: string;
  minAmountOut: string;
  executorTip: string;
  predictorWindowEnd: number;
  deadline: number;
  nonce: string;
  sponsorUse: string;
  walletUse: string;
  createdBlock: number;
  createdTxHash: string;
  createdAt: Date;
  status: string;
  filledIn: string | null;
  filledOut: string | null;
  refundedIn: string | null;
  tipPaid: string | null;
  walletRefunded: string | null;
  sponsorReleased: string | null;
  settledAt: number | null;
  settledTxHash: string | null;
  slices?: Array<{
    id: bigint;
    chainId: number;
    commitmentHash: string;
    sliceIndex: number;
    quoteHash: string;
    counterparty: string;
    sliceIn: string;
    sliceOut: string;
    sliceBonus: string;
    predictionId: string;
    txHash: string;
    blockNumber: number;
  }>;
  slashes?: Array<{
    id: bigint;
    chainId: number;
    commitmentHash: string;
    counterparty: string;
    vaultDrained: string;
    makeWhole: string;
    poolContribution: string;
    poolReceived: string;
    txHash: string;
    blockNumber: number;
  }>;
};

const mapCommitment = (row: CommitmentRow) => ({
  id: row.id,
  chainId: row.chainId,
  predictor: row.predictor,
  pickConfigId: row.pickConfigId,
  amountIn: row.amountIn,
  minFillIn: row.minFillIn,
  minAmountOut: row.minAmountOut,
  executorTip: row.executorTip,
  predictorWindowEnd: row.predictorWindowEnd,
  deadline: row.deadline,
  nonce: row.nonce,
  sponsorUse: row.sponsorUse,
  walletUse: row.walletUse,
  createdBlock: row.createdBlock,
  createdTxHash: row.createdTxHash,
  createdAt: row.createdAt,
  status: row.status as CommitmentStatus,
  filledIn: row.filledIn,
  filledOut: row.filledOut,
  refundedIn: row.refundedIn,
  tipPaid: row.tipPaid,
  walletRefunded: row.walletRefunded,
  sponsorReleased: row.sponsorReleased,
  settledAt: row.settledAt,
  settledTxHash: row.settledTxHash,
  slices: (row.slices ?? []).map((s) => ({
    id: s.id.toString(),
    chainId: s.chainId,
    commitmentHash: s.commitmentHash,
    sliceIndex: s.sliceIndex,
    quoteHash: s.quoteHash,
    counterparty: s.counterparty,
    sliceIn: s.sliceIn,
    sliceOut: s.sliceOut,
    sliceBonus: s.sliceBonus,
    predictionId: s.predictionId,
    txHash: s.txHash,
    blockNumber: s.blockNumber,
  })),
  slashes: (row.slashes ?? []).map((s) => ({
    id: s.id.toString(),
    chainId: s.chainId,
    commitmentHash: s.commitmentHash,
    counterparty: s.counterparty,
    vaultDrained: s.vaultDrained,
    makeWhole: s.makeWhole,
    poolContribution: s.poolContribution,
    poolReceived: s.poolReceived,
    txHash: s.txHash,
    blockNumber: s.blockNumber,
  })),
});

export const commitment: NonNullable<QueryResolvers['commitment']> = async (
  _parent,
  { commitmentHash }
) => {
  const row = await prisma.commitment.findUnique({
    where: { id: commitmentHash.toLowerCase() },
    include: {
      slices: { orderBy: { sliceIndex: 'asc' } },
      slashes: { orderBy: { id: 'asc' } },
    },
  });
  if (!row) return null;
  return mapCommitment(row as CommitmentRow);
};

export const commitments: NonNullable<QueryResolvers['commitments']> = async (
  _parent,
  { predictor, status, limit, offset }
) => {
  const cappedLimit = Math.max(1, Math.min(limit, 100));
  const where: Record<string, unknown> = {};
  if (predictor) where.predictor = predictor.toLowerCase();
  if (status && VALID_STATUSES.has(status)) where.status = status;

  const rows = await prisma.commitment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: cappedLimit,
    skip: offset,
    include: {
      slices: { orderBy: { sliceIndex: 'asc' } },
      slashes: { orderBy: { id: 'asc' } },
    },
  });
  return rows.map((r) => mapCommitment(r as CommitmentRow));
};

export const counterpartyVaultBalance: NonNullable<
  QueryResolvers['counterpartyVaultBalance']
> = async (_parent, { address }) => {
  const events = await prisma.counterpartyVaultEvent.findMany({
    where: { counterparty: address.toLowerCase() },
    select: { eventType: true, amount: true },
  });

  let balance = 0n;
  for (const ev of events) {
    const amt = BigInt(ev.amount);
    if (ev.eventType === 'deposit') balance += amt;
    else if (ev.eventType === 'withdraw' || ev.eventType === 'slash') {
      balance -= amt;
    }
  }
  if (balance < 0n) balance = 0n;
  return balance.toString();
};

export const counterpartyVaultHistory: NonNullable<
  QueryResolvers['counterpartyVaultHistory']
> = async (_parent, { address, limit }) => {
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const rows = await prisma.counterpartyVaultEvent.findMany({
    where: { counterparty: address.toLowerCase() },
    orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
    take: cappedLimit,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    chainId: r.chainId,
    counterparty: r.counterparty,
    eventType: r.eventType,
    amount: r.amount,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    indexedAt: r.indexedAt,
  }));
};

export const insurancePoolEvents: NonNullable<
  QueryResolvers['insurancePoolEvents']
> = async (_parent, { limit }) => {
  const cappedLimit = Math.max(1, Math.min(limit, 500));
  const rows = await prisma.insurancePoolEvent.findMany({
    orderBy: [{ blockNumber: 'desc' }, { logIndex: 'desc' }],
    take: cappedLimit,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    chainId: r.chainId,
    eventType: r.eventType,
    fromCounterparty: r.fromCounterparty,
    commitmentHash: r.commitmentHash,
    amount: r.amount,
    txHash: r.txHash,
    blockNumber: r.blockNumber,
    indexedAt: r.indexedAt,
  }));
};
