export type RessponseCandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type StorageData = {
  [interval: string]: IntervalStore;
};

export type IntervalStore = {
  resourceStore: Store;
  marketStore: {
    [epoch: string]: Store;
  };
  indexStore: {
    [epoch: string]: Store;
  };
  trailingAvgStore: {
    [trailingAvgTime: string]: Store;
  };
};

export type Store = {
  data: (CandleData | IndexData)[];
  metadata: CandleMetadata[];
};

export type CandleData = {
  t: number; // timestamp
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
};

export type IndexData = {
  t: number; // timestamp
  v: string; // value
  c: string; // cumulative
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

// TrailingAvg related types (now separate)
export type TrailingAvgStorage = TrailingAvgData[];

export type TrailingAvgData = {
  t: number; // timestamp
  u: string; // used
  f: string; // fee
};
