// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ISapienceStructs} from "./ISapienceStructs.sol";
import {Position} from "../storage/Position.sol";

interface IViewsModule {
    function getMarketGroup()
        external
        view
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            ISapienceStructs.MarketParams memory marketParams
        );

    function getMarket(uint256 id)
        external
        view
        returns (ISapienceStructs.MarketData memory marketData, ISapienceStructs.MarketParams memory marketParams);

    function getLatestMarket()
        external
        view
        returns (ISapienceStructs.MarketData memory marketData, ISapienceStructs.MarketParams memory marketParams);

    function getPosition(uint256 positionId) external returns (Position.Data memory);

    function getPositionSize(uint256 positionId) external returns (int256);

    /**
     * @notice Gets the current reference price
     * @param marketId id of the market to get the reference price
     * @return sqrtPriceX96 the pool's current sqrt price or zero if the market is settled
     */
    function getSqrtPriceX96(uint256 marketId) external view returns (uint160 sqrtPriceX96);

    /**
     * @notice Gets the current reference price
     * @param marketId id of the market to get the reference price
     * @return price18Digits the reference price in 18 digits
     */
    function getReferencePrice(uint256 marketId) external view returns (uint256 price18Digits);

    /**
     * @notice Gets the current value of a position
     * @param positionId id of the position
     * @return collateralValue value of the position, collateral denominated
     */
    function getPositionCollateralValue(uint256 positionId) external view returns (uint256 collateralValue);

    /**
     * @notice Gets the current PnL of a position (either Trade or Liquidity)
     * @param positionId id of the position
     * @return pnl the PnL of the position in collateral units
     */
    function getPositionPnl(uint256 positionId) external view returns (int256 pnl);

    function getMarketGroupTickSpacing() external view returns (int24);

    function getDecimalPriceFromSqrtPriceX96(uint160 sqrtPriceX96) external view returns (uint256);
}
