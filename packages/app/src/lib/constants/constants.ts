import type { PeriodContextType } from '../context/PeriodProvider';

export const TOKEN_DECIMALS = 18; // should be retrieved from the contract?

export const LOCAL_MARKET_CHAIN_ID = 13370;

export const CREATE_LIQUIDITY_REDUCTION = 0.0001;

export const MIN_BIG_INT_SIZE = BigInt(10);

export const TICK_SPACING_DEFAULT = 200; // i.e. 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()

export const API_BASE_URL = process.env.NEXT_PUBLIC_FOIL_API_URL;

export const ADMIN_AUTHENTICATE_MSG =
  'Please sign this message to authenticate yourself as an admin.';

export const HIGH_PRICE_IMPACT = 5;

export const BLANK_MARKET: PeriodContextType = {
  chain: undefined,
  address: '',
  collateralAsset: '',
  collateralAssetTicker: '',
  collateralAssetDecimals: TOKEN_DECIMALS,
  averagePrice: 0,
  startTime: 0,
  endTime: 0,
  pool: null,
  poolAddress: '0x',
  epoch: 0,
  epochSettled: false,
  foilData: {},
  chainId: 0,
  liquidity: 0,
  owner: '',
  useMarketUnits: false,
  baseAssetMinPriceTick: 0,
  baseAssetMaxPriceTick: 0,
  setUseMarketUnits: () => {},
  marketParams: {
    assertionLiveness: BigInt(0),
    bondAmount: BigInt(0),
    bondCurrency: '',
    feeRate: 0,
    optimisticOracleV3: '',
    claimStatement: '',
    uniswapPositionManager: '0x',
    uniswapQuoter: '0x',
    uniswapSwapRouter: '0x',
  },
  refetchUniswapData: () => {},
};
