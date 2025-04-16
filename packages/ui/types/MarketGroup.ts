export type MarketsApiResponse = Array<{
  id: number;
  name: string;
  chainId: number;
  address: string;
  vaultAddress: string;
  collateralAsset: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  epochs: Array<{
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  }>;
  currentEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  } | null;
  nextEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  } | null;
}>;

export interface MarketGroup {
  id: number;
  name: string;
  chainId: number;
  address: string;
  vaultAddress: string;
  collateralAsset: string;
  owner: string;
  isCumulative: boolean;
  resource: {
    id: number;
    name: string;
    slug: string;
  };
  market: {
    id: number;
    marketId: number;
    startTimestamp: number;
    endTimestamp: number;
    public: boolean;
    question?: string;
  };
}

export type MarketGroupParams = {
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: string;
  feeRate: number;
  optimisticOracleV3: string;
  claimStatement: string;
  uniswapPositionManager: `0x${string}`;
  uniswapQuoter: `0x${string}`;
  uniswapSwapRouter: `0x${string}`;
};
