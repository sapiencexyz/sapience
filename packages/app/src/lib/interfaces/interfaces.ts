export enum PositionKind {
  Liquidity,
  Trade,
}
export interface Position {
  tokenId: BigInt; // nft id
  kind: PositionKind;
  epochId: BigInt;
  // Accounting data (debt and deposited collateral)
  depositedCollateralAmount: BigInt; // configured collateral
  borrowedVEth: BigInt;
  borrowedVGas: BigInt;
  // Position data (owned tokens and position size)
  vEthAmount: BigInt;
  vGasAmount: BigInt;
  currentTokenAmount: BigInt;
}
