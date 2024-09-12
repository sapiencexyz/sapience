import { TOKEN_DECIMALS } from './constants/constants';
import type { MarketContextType } from './context/MarketProvider';

export const BLANK_MARKET: MarketContextType = {
  chain: undefined,
  address: '',
  collateralAsset: '',
  collateralAssetTicker: '',
  collateralAssetDecimals: TOKEN_DECIMALS,
  averagePrice: 0,
  startTime: 0,
  endTime: 0,
  prices: [],
  pool: null,
  poolAddress: '0x',
  epoch: 0,
  foilData: {},
  chainId: 0,
  liquidity: 0,
  owner: '',
  epochParams: {
    assertionLiveness: BigInt(0),
    baseAssetMinPriceTick: 0,
    baseAssetMaxPriceTick: 0,
    bondAmount: BigInt(0),
    bondCurrency: '',
    feeRate: 0,
    optimisticOracleV3: '',
    priceUnit: '',
    uniswapPositionManager: '0x',
    uniswapQuoter: '0x',
    uniswapSwapRouter: '0x',
  },
};
