export type ReducedCandleData = {
  t: number; // timestamp
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
};

export type ReducedIndexData = {
  t: number; // timestamp
  v: string; // value
  c: string; // cumulative
};

export type CandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type TrailingAvgData = {
  t: number; // timestamp
  u: string; // used
  f: string; // fee
};

export type MarketPriceData = {
  v: string; // value
  t: number; // timestamp
  e: number; // end timestamp
};

export type CandleMetadata = {
  u: string; // used
  f: string; // fee
  st: number; // start timestamp
  et: number; // end timestamp
};

export type IndexStore = {
  data: (ReducedCandleData | ReducedIndexData)[];
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
