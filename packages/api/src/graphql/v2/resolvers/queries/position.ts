/**
 * `position(id:)` / `positions(...)`.
 *
 * `position(id:)` takes a globalId (opaque) and decodes it. The
 * `conditionId` / `endsAt` / `result` / `settled` filters all route
 * through the pickConfiguration join.
 *
 * `positions` is a near-verbatim port of v1's WAC (weighted-average-cost)
 * synthesis — `runPositions` in sdl/resolvers/queries/escrow.ts (L225-635).
 * For each raw Position row we build a chronological event stream of
 * primary mints (Predictions) and secondary trades (buys + sells matching
 * token+holder), then walk it with running WAC. Each sell on an unsettled
 * pickConfig produces a synthetic SOLD row; if balance > 0 at the end (or
 * the pickConfig settled), we also emit an OPEN row carrying the remaining
 * cost basis. Claims are intentionally excluded — the contract reverts
 * redeem() unless the pickConfig is resolved, so any Claim is
 * post-settlement and the settlement-PnL flow on a resolved row already
 * covers it (escrow.ts L413-420).
 *
 * Pagination contract (escrow.ts L394-411): `pageInfo.hasNextPage` comes
 * from the RAW-row over-fetch (`first + 1`), and the cursor tracks raw
 * rows CONSUMED — not rows emitted — because a page of zero-balance
 * unresolved rows with no sells synthesizes to zero nodes. Clients must
 * page on `pageInfo`, never on `edges.length === 0`.
 */

import type { Prisma } from '../../../../../generated/prisma';
import prisma from '../../../../core/db';
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  buildKeysetWhere,
  clampTake,
  decodeCursor,
  encodeCursor,
  normalizeDirection,
  withCursorWhere,
  type OrderDirection,
} from '../../relay/connection';
import { tryFromGlobalIdV2 } from '../../relay/nodeRegistry';

export const position: NonNullable<QueryResolvers['position']> = async (
  _parent,
  { id }
) => {
  const parts = tryFromGlobalIdV2(id);
  if (!parts || parts.type !== 'Position') return null;
  const key = parts.id.split(':');
  // Exactly (chainId, tokenAddress, holder) — synthesized SOLD rows carry a
  // `:sell:<tradeHash>` suffix and are not individually addressable; without
  // this guard a SOLD id would silently load its OPEN parent row.
  if (key.length !== 3) return null;
  const [chainId, tokenAddress, holder] = key;
  const c = Number(chainId);
  if (!tokenAddress || !holder || !Number.isInteger(c)) return null;
  return prisma.position.findUnique({
    where: {
      chainId_tokenAddress_holder: { chainId: c, tokenAddress, holder },
    },
    include: { pickConfiguration: { include: { picks: true } } },
  });
};

/**
 * CREATED_AT / UPDATED_AT keyset on a Date column of the Position row
 * itself. RESOLVED_AT orders by the related `pickConfiguration.resolvedAt`
 * (Unix seconds, nullable) — handled on a separate branch in `positions`
 * because it keysets through the relation and restricts to resolved rows.
 */
const FIELD_TO_PRISMA: Record<
  string,
  'createdAt' | 'updatedAt' | 'resolvedAt'
> = {
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  RESOLVED_AT: 'resolvedAt',
};

/** Raw Position row as fetched for synthesis (predictions included). */
type RawPositionRow = Prisma.PositionGetPayload<{
  include: {
    pickConfiguration: { include: { picks: true; predictions: true } };
  };
}>;

type PredictionRow = NonNullable<
  RawPositionRow['pickConfiguration']
>['predictions'][number];

/**
 * WAC fields attached to each synthesized node, read by the Position
 * field resolvers (resolvers/Position.ts). `cursorRow` pins the keyset
 * cursor to the underlying raw row — SOLD rows shift `updatedAt` to the
 * trade timestamp, so the raw row's order values must travel separately.
 */
export type WacFields = {
  userCollateral: string | null;
  totalPayout: string | null;
  realizedPnl: string | null;
  status: 'OPEN' | 'SOLD';
  prediction:
    | (PredictionRow & {
        pickConfiguration: RawPositionRow['pickConfiguration'];
      })
    | null;
  /** Trade hash of the sale this SOLD row represents; null on OPEN rows. */
  soldTradeHash: string | null;
  /**
   * Order/keyset values pinned to the underlying RAW row. `resolvedAt`
   * (from the pickConfiguration, Unix seconds) travels alongside the Date
   * columns so the RESOLVED_AT keyset cursor can read it directly.
   */
  cursorRow: {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: number | null;
  };
};

export type SynthesizedPositionRow = RawPositionRow & WacFields;

/**
 * The WAC walk — port of escrow.ts L421-623 (trades fetch + per-row
 * event-stream synthesis). v1's `preloadPickConditions` warm-up is not
 * ported: v2's `Pick.condition` resolves through the `conditionById`
 * DataLoader, which batches on its own.
 */
const synthesizeWacRows = async (
  rows: RawPositionRow[]
): Promise<SynthesizedPositionRow[]> => {
  // escrow.ts L421-423: batch key space for the trades fetch.
  const chainIds = Array.from(new Set(rows.map((r) => r.chainId)));
  const tokenAddresses = Array.from(new Set(rows.map((r) => r.tokenAddress)));
  const holders = Array.from(new Set(rows.map((r) => r.holder)));

  // escrow.ts L443-461: one trades fetch for the whole page.
  const trades =
    rows.length === 0
      ? []
      : await prisma.secondaryTrade.findMany({
          where: {
            chainId: { in: chainIds },
            token: { in: tokenAddresses },
            OR: [{ seller: { in: holders } }, { buyer: { in: holders } }],
          },
          select: {
            chainId: true,
            token: true,
            seller: true,
            buyer: true,
            price: true,
            tokenAmount: true,
            executedAt: true,
            tradeHash: true,
          },
        });

  // escrow.ts L464-474: index trades by (chainId, token, holder).
  const positionKey = (chainId: number, token: string, holder: string) =>
    `${chainId}:${token}:${holder}`;
  const tradesByPos = new Map<string, typeof trades>();
  for (const t of trades) {
    for (const role of [t.seller, t.buyer] as const) {
      const k = positionKey(t.chainId, t.token, role);
      const arr = tradesByPos.get(k);
      if (arr) arr.push(t);
      else tradesByPos.set(k, [t]);
    }
  }

  const synthesized: SynthesizedPositionRow[] = [];
  for (const r of rows) {
    const pc = r.pickConfiguration;
    let totalPayout = 0n;
    // v1 carries only `predictionId` into `pickConfig` (escrow.ts L481,
    // L510, L574); v2 attaches the full row so `Position.prediction`
    // resolves without the CLAIM-permalink round trip.
    let predictionRow: PredictionRow | null = null;

    // escrow.ts L483-513: primary-mint events from holder-side Predictions.
    type Acquire = { ts: number; cost: bigint; shares: bigint };
    type Disposal = {
      tradeHash: string;
      ts: number;
      proceeds: bigint;
      shares: bigint;
    };
    const acquires: Acquire[] = [];
    const disposals: Disposal[] = [];

    if (pc) {
      for (const pred of pc.predictions) {
        const predCollateral = BigInt(pred.predictorCollateral);
        const cpCollateral = BigInt(pred.counterpartyCollateral);
        const predictionTotal = predCollateral + cpCollateral;
        const isHolderSide =
          (r.isPredictorToken && pred.predictor === r.holder) ||
          (!r.isPredictorToken && pred.counterparty === r.holder);
        if (!isHolderSide) continue;
        predictionRow ??= pred;
        totalPayout += predictionTotal;
        // Mint amount on both sides equals total collateral pool (see
        // PredictionMarketEscrow.sol). Cost is just the holder's share.
        const cost = r.isPredictorToken ? predCollateral : cpCollateral;
        acquires.push({
          ts: pred.createdAt.getTime() / 1000,
          cost,
          shares: predictionTotal,
        });
      }
    }

    // escrow.ts L515-530: secondary buys (acquires) and sells (disposals).
    const k = positionKey(r.chainId, r.tokenAddress, r.holder);
    for (const t of tradesByPos.get(k) ?? []) {
      const price = BigInt(t.price);
      const shares = BigInt(t.tokenAmount);
      if (t.buyer === r.holder) {
        acquires.push({ ts: t.executedAt, cost: price, shares });
      }
      if (t.seller === r.holder) {
        disposals.push({
          tradeHash: t.tradeHash,
          ts: t.executedAt,
          proceeds: price,
          shares,
        });
      }
    }

    const acquiresSorted = [...acquires].sort((a, b) => a.ts - b.ts);
    const disposalsSorted = [...disposals].sort((a, b) => a.ts - b.ts);

    // escrow.ts L535-570: walk acquires + disposals chronologically with a
    // running WAC pool. Each disposal records the cost basis allocated to
    // its shares using the WAC at that moment.
    let costPool = 0n;
    let sharesPool = 0n;
    let acqIdx = 0;
    type DisposalRow = Disposal & { costBasis: bigint };
    const disposalRows: DisposalRow[] = [];
    for (const d of disposalsSorted) {
      while (
        acqIdx < acquiresSorted.length &&
        acquiresSorted[acqIdx].ts <= d.ts
      ) {
        costPool += acquiresSorted[acqIdx].cost;
        sharesPool += acquiresSorted[acqIdx].shares;
        acqIdx += 1;
      }
      const allocated =
        sharesPool > 0n ? (costPool * d.shares) / sharesPool : 0n;
      disposalRows.push({ ...d, costBasis: allocated });
      costPool -= allocated;
      sharesPool -= d.shares;
      if (sharesPool < 0n) sharesPool = 0n;
      if (costPool < 0n) costPool = 0n;
    }
    while (acqIdx < acquiresSorted.length) {
      costPool += acquiresSorted[acqIdx].cost;
      sharesPool += acquiresSorted[acqIdx].shares;
      acqIdx += 1;
    }

    // escrow.ts L572-577.
    const totalUserCollateral = acquires.reduce((s, a) => s + a.cost, 0n);
    const totalPayoutStr = totalPayout > 0n ? totalPayout.toString() : null;
    const prediction = predictionRow
      ? { ...predictionRow, pickConfiguration: pc }
      : null;
    const balanceBn = BigInt(r.balance);
    const isResolved = pc?.resolved ?? false;

    // escrow.ts L579-598: one synthetic SOLD row per sell (only meaningful
    // for unresolved pickConfigs — once settled, the settlement-PnL flow
    // takes over).
    if (!isResolved) {
      for (const d of disposalRows) {
        synthesized.push({
          ...r,
          balance: '0',
          updatedAt: new Date(d.ts * 1000),
          userCollateral: d.costBasis.toString(),
          totalPayout: totalPayoutStr,
          realizedPnl: (d.proceeds - d.costBasis).toString(),
          status: 'SOLD',
          prediction,
          soldTradeHash: d.tradeHash,
          cursorRow: {
            id: r.id,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            resolvedAt: r.pickConfiguration?.resolvedAt ?? null,
          },
        });
      }
    }

    // escrow.ts L600-622: OPEN / parent row — keep when there's still
    // balance, or when the position is settled. A zero-balance unresolved
    // row with no sells means the holder transferred or burned the tokens
    // off-platform — drop it.
    if (balanceBn > 0n || isResolved) {
      const remainingCost =
        !isResolved && disposalRows.length > 0 ? costPool : totalUserCollateral;
      synthesized.push({
        ...r,
        userCollateral: remainingCost > 0n ? remainingCost.toString() : null,
        totalPayout: totalPayoutStr,
        realizedPnl: null,
        status: 'OPEN',
        prediction,
        soldTradeHash: null,
        cursorRow: {
          id: r.id,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          resolvedAt: r.pickConfiguration?.resolvedAt ?? null,
        },
      });
    }
  }

  return synthesized;
};

/**
 * Keyset predicate for RESOLVED_AT ordering. `resolvedAt` lives on the
 * to-one `pickConfiguration` relation (not the Position row), and is
 * nullable — unresolved positions are kept and ordered NULLS LAST so
 * sorting never silently drops them (sorting must not become filtering).
 *
 * The cursor `k` is the resolvedAt seconds, or '' for a null-resolvedAt row
 * (the "null phase" at the tail of the ordering):
 *
 *   - cursor in the non-null phase → later non-null rows, the id tie-break,
 *     PLUS every null row (all nulls sort after any non-null in NULLS LAST).
 *   - cursor in the null phase → only further null rows by id.
 */
const buildResolvedAtKeyset = (
  cursorK: string,
  idValue: number,
  direction: OrderDirection
): Prisma.PositionWhereInput => {
  const op = direction === 'desc' ? 'lt' : 'gt';

  if (cursorK === '') {
    // Null phase: continue through the remaining null-resolvedAt rows by id.
    return {
      AND: [
        { pickConfiguration: { resolvedAt: null } },
        { id: { [op]: idValue } },
      ],
    };
  }

  const value = Number(cursorK);
  return {
    OR: [
      { pickConfiguration: { resolvedAt: { [op]: value } } },
      {
        AND: [
          { pickConfiguration: { resolvedAt: value } },
          { id: { [op]: idValue } },
        ],
      },
      { pickConfiguration: { resolvedAt: null } },
    ],
  };
};

export const positions: NonNullable<QueryResolvers['positions']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, { defaultTake: 25, maxTake: 25 });
  const orderField = FIELD_TO_PRISMA[args.orderBy?.field ?? 'UPDATED_AT'];
  const direction = normalizeDirection(args.orderBy?.direction, 'desc');
  // RESOLVED_AT orders by the related pickConfiguration.resolvedAt; the
  // others keyset on a Date column of the Position row itself.
  const byResolvedAt = orderField === 'resolvedAt';
  const dateField = byResolvedAt
    ? null
    : (orderField as 'createdAt' | 'updatedAt');
  const holderLower = args.filter?.holder?.toLowerCase();

  const where: Prisma.PositionWhereInput = {};
  if (holderLower) where.holder = holderLower;
  if (args.filter?.chainId != null) where.chainId = args.filter.chainId;
  if (args.filter?.pickConfigId)
    where.pickConfigId = args.filter.pickConfigId.toLowerCase();

  const pickConfigFilter: Prisma.PicksWhereInput = {};
  let hasPickConfigFilter = false;
  if (args.filter?.conditionIds?.length) {
    pickConfigFilter.picks = {
      some: {
        conditionId: {
          in: args.filter.conditionIds.map((id) => id.toLowerCase()),
        },
      },
    };
    hasPickConfigFilter = true;
  }
  if (args.filter?.results?.length) {
    pickConfigFilter.result = {
      in: args.filter.results as Prisma.EnumSettlementResultFilter['in'],
    };
    hasPickConfigFilter = true;
  }
  if (args.filter?.settled != null) {
    pickConfigFilter.resolved = args.filter.settled;
    hasPickConfigFilter = true;
  }
  if (args.filter?.endsAt) {
    const r: Prisma.IntFilter = {};
    if (args.filter.endsAt.gte != null) r.gte = args.filter.endsAt.gte;
    if (args.filter.endsAt.lte != null) r.lte = args.filter.endsAt.lte;
    pickConfigFilter.endsAt = r;
    hasPickConfigFilter = true;
  }
  // RESOLVED_AT keeps unresolved positions (ordered NULLS LAST) — it must
  // not filter them out, so no resolvedAt-non-null restriction here.
  if (hasPickConfigFilter) where.pickConfiguration = pickConfigFilter;

  const cursor = args.after ? decodeCursor(args.after) : null;
  let cursorWhere: Prisma.PositionWhereInput | null = null;
  if (cursor) {
    cursorWhere = byResolvedAt
      ? buildResolvedAtKeyset(cursor.k, Number(cursor.id), direction)
      : buildKeysetWhere<Prisma.PositionWhereInput>({
          orderField: dateField as string,
          orderValue: new Date(cursor.k),
          idField: 'id',
          idValue: Number(cursor.id),
          direction,
        });
  }

  // escrow.ts L380-392: we only need the rows where the holder is a party
  // to compute their cost basis, so push the filter into the include and
  // avoid pulling every other user's prediction back over the wire. When
  // `holder` isn't pinned (conditionIds / pickConfigId path), keep the
  // full set.
  const predictionsInclude: Prisma.Picks$predictionsArgs | true = holderLower
    ? {
        where: {
          OR: [{ predictor: holderLower }, { counterparty: holderLower }],
        },
      }
    : true;

  const orderBy: Prisma.PositionOrderByWithRelationInput[] = byResolvedAt
    ? [
        // NULLS LAST so unresolved positions sink to the tail instead of
        // being filtered out.
        {
          pickConfiguration: { resolvedAt: { sort: direction, nulls: 'last' } },
        },
        { id: direction },
      ]
    : [
        {
          [dateField as string]: direction,
        } as Prisma.PositionOrderByWithRelationInput,
        { id: direction },
      ];

  // escrow.ts L394-411: fetch first+1 raw rows to derive hasNextPage
  // without a count query. Synthesized pages can be empty (zero-balance
  // unresolved rows with no sells), so emitted-row count is unreliable as
  // a stop signal — pagination is raw-row truth.
  const rawRows = (await prisma.position.findMany({
    where: withCursorWhere(where, cursorWhere),
    orderBy,
    include: {
      pickConfiguration: {
        include: { picks: true, predictions: predictionsInclude },
      },
    },
    take: first + 1,
    // The conditional `predictions` include defeats Prisma's payload
    // inference (it unions the filtered/unfiltered shapes); the rows are
    // structurally RawPositionRow either way.
  })) as RawPositionRow[];
  const hasNextPage = rawRows.length > first;
  const pageRows = rawRows.slice(0, first);

  const items = await synthesizeWacRows(pageRows);

  // escrow.ts L625-633: for the Date orderings, re-sort by the requested
  // field — synthetic SOLD rows carry the trade's executedAt as their
  // updatedAt, so without this they'd group under their parent rather than
  // interleave by recency. RESOLVED_AT is left in DB order: all synthesized
  // rows from one raw row share that row's resolvedAt, so the page is
  // already correctly ordered (NULLS LAST) and re-sorting would only risk
  // disturbing the null tie-break.
  if (dateField) {
    items.sort((a, b) => {
      const diff = b[dateField].getTime() - a[dateField].getTime();
      return direction === 'asc' ? -diff : diff;
    });
  }

  // Cursors always point at the underlying RAW row (SOLD rows share their
  // parent's cursor): resuming `after:` a synthesized row resumes after
  // the raw row that produced it — the same granularity v1's skip-based
  // paging had.
  // For RESOLVED_AT, `k` is the resolvedAt seconds, or '' for a
  // null-resolvedAt row — the sentinel that puts the cursor in the keyset's
  // null phase (see buildResolvedAtKeyset).
  const rowCursor = (row: {
    id: number;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: number | null;
  }) =>
    encodeCursor({
      k: dateField
        ? row[dateField].toISOString()
        : row.resolvedAt == null
          ? ''
          : String(row.resolvedAt),
      id: String(row.id),
    });
  const edges = items.map((node) => ({
    node,
    cursor: rowCursor(node.cursorRow),
  }));
  const lastRawRow = pageRows.at(-1);
  const lastCursorRow = lastRawRow
    ? {
        id: lastRawRow.id,
        createdAt: lastRawRow.createdAt,
        updatedAt: lastRawRow.updatedAt,
        resolvedAt: lastRawRow.pickConfiguration?.resolvedAt ?? null,
      }
    : null;

  // v1 positionCount semantics (escrow.ts L75-90): drop zero-balance
  // unresolved rows (off-platform transfers/burns) so the count matches
  // the set of underlying positions the synthesis surfaces.
  const countWhere: Prisma.PositionWhereInput = {
    AND: [
      where,
      { NOT: { balance: '0', pickConfiguration: { resolved: false } } },
    ],
  };

  return {
    edges,
    nodes: items,
    // Lazy thunk, same trick as relay/pagination.ts buildConnection:
    // graphql-js's default field resolver invokes it only when the client
    // selects `totalCount`.
    totalCount: (() =>
      prisma.position.count({ where: countWhere })) as unknown as number,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      // The cursor advances past the raw rows this page CONSUMED, not the
      // rows it emitted — a page can synthesize zero nodes while more raw
      // rows exist (the empty-page/hasNextPage contract above).
      endCursor: lastCursorRow ? rowCursor(lastCursorRow) : null,
    },
  };
};
