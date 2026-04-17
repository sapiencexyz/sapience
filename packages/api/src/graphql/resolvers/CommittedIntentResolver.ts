import {
  Arg,
  Field,
  Int,
  ObjectType,
  Query,
  Resolver,
  registerEnumType,
} from 'type-graphql';
import prisma from '../../db';

// ============================================================================
// Enums
// ============================================================================

/** Lifecycle state of a committed intent (PRD-001 §3). */
export enum CommitmentStatus {
  OPEN = 'OPEN',
  EXECUTED = 'EXECUTED',
  EXPIRED = 'EXPIRED',
  SLASH_ONLY_STAY_ALIVE = 'SLASH_ONLY_STAY_ALIVE',
}

registerEnumType(CommitmentStatus, {
  name: 'CommitmentStatus',
  description:
    'Lifecycle state of a committed intent: OPEN (awaiting execute), EXECUTED (settled with mint), EXPIRED (refunded after deadline), SLASH_ONLY_STAY_ALIVE (T2 silent-no-mint observation, may still settle).',
});

// ============================================================================
// GraphQL Object Types
// ============================================================================

@ObjectType('CommitmentSlice', {
  description:
    'A single slice fill within a committed intent — the on-chain result of one counterparty quote',
})
class CommitmentSliceType {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  commitmentHash!: string;

  @Field(() => Int)
  sliceIndex!: number;

  @Field(() => String)
  quoteHash!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  sliceIn!: string;

  @Field(() => String)
  sliceOut!: string;

  @Field(() => String)
  sliceBonus!: string;

  @Field(() => String)
  predictionId!: string;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;
}

@ObjectType('CommitmentSlash', {
  description:
    'A counterparty slash recorded during execute() — vault drained, make-whole credit, insurance pool flows',
})
class CommitmentSlashType {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  commitmentHash!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  vaultDrained!: string;

  @Field(() => String)
  makeWhole!: string;

  @Field(() => String)
  poolContribution!: string;

  @Field(() => String)
  poolReceived!: string;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;
}

@ObjectType('Commitment', {
  description:
    'An on-chain committed intent signed by a predictor (PRD-001 §1). Tracks signed parameters, lifecycle status, and all slices and slashes observed during execute().',
})
class CommitmentType {
  @Field(() => String, { description: 'EIP-712 commitment hash (0x-prefixed)' })
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  predictor!: string;

  @Field(() => String)
  pickConfigId!: string;

  @Field(() => String)
  amountIn!: string;

  @Field(() => String)
  minFillIn!: string;

  @Field(() => String)
  minAmountOut!: string;

  @Field(() => String)
  executorTip!: string;

  @Field(() => Int)
  predictorWindowEnd!: number;

  @Field(() => Int)
  deadline!: number;

  @Field(() => String)
  nonce!: string;

  @Field(() => String)
  sponsorUse!: string;

  @Field(() => String)
  walletUse!: string;

  @Field(() => Int)
  createdBlock!: number;

  @Field(() => String)
  createdTxHash!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => CommitmentStatus)
  status!: CommitmentStatus;

  @Field(() => String, { nullable: true })
  filledIn?: string | null;

  @Field(() => String, { nullable: true })
  filledOut?: string | null;

  @Field(() => String, { nullable: true })
  refundedIn?: string | null;

  @Field(() => String, { nullable: true })
  tipPaid?: string | null;

  @Field(() => String, { nullable: true })
  walletRefunded?: string | null;

  @Field(() => String, { nullable: true })
  sponsorReleased?: string | null;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => String, { nullable: true })
  settledTxHash?: string | null;

  @Field(() => [CommitmentSliceType])
  slices!: CommitmentSliceType[];

  @Field(() => [CommitmentSlashType])
  slashes!: CommitmentSlashType[];
}

@ObjectType('CounterpartyVaultEvent', {
  description:
    'Vault-level deposit, withdrawal, or slash event on the CounterpartyVault',
})
class CounterpartyVaultEventType {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String, {
    description: 'One of "deposit", "withdraw", "slash"',
  })
  eventType!: string;

  @Field(() => String)
  amount!: string;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;

  @Field(() => Date)
  indexedAt!: Date;
}

@ObjectType('InsurancePoolEvent', {
  description:
    'Insurance pool funding or draw event emitted from CommittedIntentExecutor during slash handling',
})
class InsurancePoolEventType {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String, { description: 'One of "funded", "drawn"' })
  eventType!: string;

  @Field(() => String, { nullable: true })
  fromCounterparty?: string | null;

  @Field(() => String, { nullable: true })
  commitmentHash?: string | null;

  @Field(() => String)
  amount!: string;

  @Field(() => String)
  txHash!: string;

  @Field(() => Int)
  blockNumber!: number;

  @Field(() => Date)
  indexedAt!: Date;
}

// ============================================================================
// Mappers
// ============================================================================

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

function mapCommitment(row: CommitmentRow): CommitmentType {
  return {
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
  };
}

// ============================================================================
// Resolver
// ============================================================================

@Resolver()
export class CommittedIntentResolver {
  /** Look up a single commitment by its commitmentHash. */
  @Query(() => CommitmentType, {
    nullable: true,
    description:
      'Look up a single committed intent by its EIP-712 commitmentHash, including all slices and slashes indexed against it',
  })
  async commitment(
    @Arg('commitmentHash', () => String) commitmentHash: string
  ): Promise<CommitmentType | null> {
    const row = await prisma.commitment.findUnique({
      where: { id: commitmentHash.toLowerCase() },
      include: {
        slices: { orderBy: { sliceIndex: 'asc' } },
        slashes: { orderBy: { id: 'asc' } },
      },
    });
    if (!row) return null;
    return mapCommitment(row as CommitmentRow);
  }

  /** Paginated list of commitments. */
  @Query(() => [CommitmentType], {
    description:
      'Paginated list of committed intents, filterable by predictor and status',
  })
  async commitments(
    @Arg('predictor', () => String, { nullable: true }) predictor?: string,
    @Arg('status', () => CommitmentStatus, { nullable: true })
    status?: CommitmentStatus,
    @Arg('limit', () => Int, { defaultValue: 50 }) limit: number = 50,
    @Arg('offset', () => Int, { defaultValue: 0 }) offset: number = 0
  ): Promise<CommitmentType[]> {
    const cappedLimit = Math.max(1, Math.min(limit, 100));
    const where: Record<string, unknown> = {};
    if (predictor) where.predictor = predictor.toLowerCase();
    if (status) where.status = status;

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
  }

  /**
   * Latest computed vault balance for a counterparty, derived from indexed
   * events: sum(deposit) - sum(withdraw) - sum(slash). Returned as stringified
   * wei. Returns "0" when the counterparty has no tracked events.
   */
  @Query(() => String, {
    description:
      'Derived CounterpartyVault balance for an address, computed as sum(deposit) - sum(withdraw) - sum(slash) over indexed events. Returns stringified wei.',
  })
  async counterpartyVaultBalance(
    @Arg('address', () => String) address: string
  ): Promise<string> {
    const addr = address.toLowerCase();
    const events = await prisma.counterpartyVaultEvent.findMany({
      where: { counterparty: addr },
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
  }

  @Query(() => [CounterpartyVaultEventType], {
    description:
      'Vault event history for a counterparty (deposits, withdrawals, slashes), ordered by block descending',
  })
  async counterpartyVaultHistory(
    @Arg('address', () => String) address: string,
    @Arg('limit', () => Int, { defaultValue: 100 }) limit: number = 100
  ): Promise<CounterpartyVaultEventType[]> {
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
  }

  @Query(() => [InsurancePoolEventType], {
    description:
      'Paginated list of insurance-pool funding / draw events, most recent first',
  })
  async insurancePoolEvents(
    @Arg('limit', () => Int, { defaultValue: 100 }) limit: number = 100
  ): Promise<InsurancePoolEventType[]> {
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
  }
}
