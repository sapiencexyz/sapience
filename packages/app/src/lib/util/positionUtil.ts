import type { Pool } from "@uniswap/v3-sdk";

export const calculatePnL = (position: any, pool: Pool | null) => {
  const vEthToken = Number.parseFloat(position.quoteToken);
  const borrowedVEth = Number.parseFloat(position.borrowedQuoteToken);
  const vGasToken = Number.parseFloat(position.baseToken);
  const borrowedVGas = Number.parseFloat(position.borrowedBaseToken);
  const marketPrice = Number.parseFloat(
    pool?.token0Price?.toSignificant(18) || "0",
  );

  return vEthToken - borrowedVEth + (vGasToken - borrowedVGas) * marketPrice;
};
