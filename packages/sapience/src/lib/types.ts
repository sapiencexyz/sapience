export interface Market {
  chainId: number;
  address: string;
  owner: string;
  collateralAsset: string;
}

export interface Epoch {
  epochId: number;
  endTimestamp: number;
}
