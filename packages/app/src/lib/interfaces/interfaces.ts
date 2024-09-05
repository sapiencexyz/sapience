export enum PositionKind {
  Unknown,
  Liquidity,
  Trade,
}
export interface FoilPosition {
  id: bigint; // nft id
  kind: PositionKind;
  epochId: bigint;
  // Accounting data (debt and deposited collateral)
  depositedCollateralAmount: bigint; // configured collateral
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  // Position data (owned tokens and position size)
  vEthAmount: bigint;
  vGasAmount: bigint;
  // currentTokenAmount: bigint;
}

export enum TransactionType {
  ADD_LIQUIDITY = 'addLiquidity',
  REMOVE_LIQUIDITY = 'removeLiquidity',
  LONG = 'long',
  SHORT = 'short',
}
