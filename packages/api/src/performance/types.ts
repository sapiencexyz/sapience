export type CandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type TrailingAvgData = {
  timestamp: number;
  used: string;
  feePaid: string;
};

export type CandleMetadata = {
  used: bigint;
  feePaid: bigint;
  startTimestamp: number;
  endTimestamp: number;
};

export type IndexStore = {
  data: CandleData[];
  metadata: CandleMetadata[];
  pointers: {
    [closestTimestamp: number]: number;
  };
  trailingAvgData: TrailingAvgData[];
};

export type IntervalStore = {
  resourceStore: IndexStore;
  trailingAvgStore: IndexStore;
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
