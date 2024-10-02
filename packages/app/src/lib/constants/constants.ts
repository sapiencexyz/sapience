import type { MarketContextType } from '../context/MarketProvider';

export const TOKEN_DECIMALS = 18; // should be retrieved from the contract?
export const LOCAL_MARKET_CHAIN_ID = 13370;
export const DECIMAL_PRECISION_DISPLAY = 4;

export const MIN_BIG_INT_SIZE = BigInt(10);

export const API_BASE_URL = 'https://api.foil.xyz';

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
  stEthPerToken: 0,
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
  refetchUniswapData: () => {},
};
