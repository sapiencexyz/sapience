type LazyConnectionTotalCountParent = {
  totalCount?: number | null;
  _totalCount?: () => Promise<number>;
};

const totalCount = async (parent: unknown): Promise<number> => {
  const p = parent as LazyConnectionTotalCountParent;
  if (typeof p.totalCount === 'number') return p.totalCount;
  if (!p._totalCount) {
    throw new Error('Connection totalCount was requested but not initialized');
  }
  return p._totalCount();
};

export const ActivityConnection = { totalCount };
export const QuestionConnection = { totalCount };
