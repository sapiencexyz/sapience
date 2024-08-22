export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}
export interface FoilPosition {
  tokenId: bigint; // nft id
  kind: PositionKind;
  epochId: bigint;
  // Accounting data (debt and deposited collateral)
  depositedCollateralAmount: bigint; // configured collateral
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  // Position data (owned tokens and position size)
  vEthAmount: bigint;
  vGasAmount: bigint;
  currentTokenAmount: bigint;
}
