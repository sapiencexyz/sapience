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
}