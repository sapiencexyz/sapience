export interface MarketGroup {
  chainId: number;
  address: string;
  owner: string;
  collateralAsset: string;
}

export interface Market {
  marketId: number;
  endTimestamp: number;
}
