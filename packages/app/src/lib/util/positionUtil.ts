import type { Pool } from '@uniswap/v3-sdk';

export const calculatePnL = (position: any, pool: Pool | null) => {
  const vEthToken = parseFloat(position.quoteToken);
  const borrowedVEth = parseFloat(position.borrowedQuoteToken);
  const vGasToken = parseFloat(position.baseToken);
  const borrowedVGas = parseFloat(position.borrowedBaseToken);
  const marketPrice = parseFloat(pool?.token0Price?.toSignificant(18) || '0');

  return vEthToken - borrowedVEth + (vGasToken - borrowedVGas) * marketPrice;
};
