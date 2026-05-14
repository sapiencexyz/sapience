/**
 * Shared lazy-`totalCount` factory for `*Page` field resolvers.
 *
 * Every `*Page` envelope returned by a paginated `runX` runner carries:
 *   - `totalCount?: number | null` — pre-populated when the runner already
 *     knew the count (cheap in-memory derivation, or zero on an
 *     early-return path).
 *   - `_countWhere?: <ModelWhereInput>` — the same Prisma where the
 *     runner used for `items`, kept so the COUNT(*) only fires when the
 *     client selects the field.
 *
 * The deprecated bare-array wrappers (`positions`, `predictions`, …)
 * discard the envelope entirely, so they get the count-skip for free.
 *
 * Pages whose runner can't cheaply produce a `_countWhere` (the union
 * feed on `questionsPage`, the merged predictions/trades feed on
 * `activityPage`) keep their own dedicated resolver and stay `null`
 * even when selected.
 */

interface CountableModel<W> {
  count(args?: { where?: W }): Promise<number>;
}

type LazyTotalCountParent<W> = {
  totalCount?: number | null;
  _countWhere?: W;
};

/**
 * Returns a `totalCount` field resolver bound to a Prisma model. The
 * concrete `*Page` resolver then becomes a single line:
 *
 *     export const PositionsPage = { totalCount: lazyTotalCount(prisma.position) };
 */
export const lazyTotalCount =
  <W, M extends CountableModel<W>>(model: M) =>
  async (parent: unknown): Promise<number | null> => {
    const p = parent as LazyTotalCountParent<W>;
    if (typeof p.totalCount === 'number') return p.totalCount;
    if (!p._countWhere) return null;
    return model.count({ where: p._countWhere });
  };
