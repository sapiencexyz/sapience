export type ReducedCandleData = {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
};

export type CandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type TrailingAvgData = {
  t: number;
  u: string;
  f: string;
};

export type MarketPriceData = {
  v: string;
  t: number;
  e: number;
};

export type CandleMetadata = {
  u: string;
  f: string;
  st: number;
  et: number;
};

export type IndexStore = {
  data: ReducedCandleData[];
  metadata: CandleMetadata[];
  trailingAvgData: TrailingAvgData[];
};

export type IntervalStore = {
  resourceStore: IndexStore;
  trailingAvgStore: {
    [trailingAvgTime: string]: IndexStore;
  };
  indexStore: {
    [epoch: string]: IndexStore;
  };
  marketStore: {
    [epoch: string]: IndexStore;
  };
};

export type StorageData = {
  [interval: string]: IntervalStore;
};
