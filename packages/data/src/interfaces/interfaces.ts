export const LIQUIDITY_POSITION_EVENT_NAME = "LiquidityPositionCreated";
export interface LiquidityPositionEventLog {
  tokenId: string;
  addedAmount0: string;
  addedAmount1: string;
  liquidity: string;
}
