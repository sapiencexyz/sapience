export interface Position {
  id: string;
  market: string;
  size: string;
  collateral: string;
  pnl: string;
  isSettleable: boolean;
}

export interface Action {
  type: 'SETTLE' | 'CREATE_POSITION' | 'MODIFY_POSITION';
  positionId?: string;
  marketAddress?: string;
  size?: string;
  collateral?: string;
} 