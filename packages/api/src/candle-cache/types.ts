export type ResponseCandleData = {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
};

export type ReducedMarketPrice = {
  timestamp: number;
  market: number;
  value: string;
};

export type PriceDatapoint = {
  timestamp: number;
  used: string;
  fee: string;
};

export interface ResourceHistory {
  prices: PriceDatapoint[];
  pointers: Map<number, number>; // trailingAvgWindowTime -> index in prices array
  sums: Map<
    number,
    { sumUsed: bigint; sumFeePaid: bigint; startOfTrailingWindow: number }
  >; // trailingAvgWindowTime -> sums
}
