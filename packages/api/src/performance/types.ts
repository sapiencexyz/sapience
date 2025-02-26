export type CandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
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
};

export type StorageData = {
  [interval: string]: {
    resourceStore: IndexStore;
    trailingAvgStore: IndexStore;
    indexStore: {
      [epoch: string]: IndexStore;
    };
    marketStore: {
      [market: string]: IndexStore;
    };
  };
};
