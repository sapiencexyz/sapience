export interface Market {
  id: string;
  marketId: string;
  question?: string | null; // Question can be null
  startTimestamp: number;
  endTimestamp: number;
  settled: boolean;
}

export interface MarketGroup {
  id: string;
  address: string;
  chainId: number;
  question?: string | null; // Question can be null
  markets: Market[];
  placeholder?: boolean; // Keep placeholder for loading/error states
  optionNames?: string[];
  baseTokenName?: string;
  quoteTokenName?: string;
}
