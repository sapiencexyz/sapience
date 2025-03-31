export type ResponseCandleData = {
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
  datapoints: Datapoint[];
};

export type Datapoint = {
  timestamp: number; // datapoint timestamp
	endTimestamp: number;
  data: CandleData | IndexData;
  metadata: GenericMetadata | IndexMetadata | TrailingAvgMetadata;
}

export type CandleData = {
  // t: number; // timestamp
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
};

export type IndexData = {
  // t: number; // timestamp
  v: string; // value
  c: string; // cumulative
};

export type MarketPriceData = {
  v: string; // value
  t: number; // timestamp
  e: number; // end timestamp
};

export type GenericMetadata = {
	// Datapoint metadata for all
	lastIncludedTimestamp: number;
}
export type IndexMetadata = GenericMetadata & {
  sumUsed: string;
	sumPaid: string;
};
export type TrailingAvgMetadata = IndexMetadata & {
  trailingStartTimestamp: number
};

// TrailingAvg related types (now separate)
export type ResourceCacheTrailingAvgStorage = ResourceCacheTrailingAvgData[];

export type ResourceCacheTrailingAvgData = {
  t: number; // timestamp
  u: string; // used
  f: string; // fee
};
