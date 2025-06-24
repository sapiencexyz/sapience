// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import "../storage/Position.sol";
import "../storage/Trade.sol";
import "../interfaces/IViewsModule.sol";
import "../interfaces/ISapienceStructs.sol";
import {SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {DecimalMath} from "../libraries/DecimalMath.sol";
import {DecimalPrice} from "../libraries/DecimalPrice.sol";

contract ViewsModule is IViewsModule {
    using Position for Position.Data;
    using Market for Market.Data;
    using MarketGroup for MarketGroup.Data;
    using SafeCastU256 for uint256;
    using DecimalMath for int256;

    function getMarketGroup()
        external
        view
        override
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            ISapienceStructs.MarketParams memory marketParams
        )
    {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        return (
            marketGroup.owner,
            address(marketGroup.collateralAsset),
            address(marketGroup.feeCollectorNFT),
            marketGroup.marketParams
        );
    }

    function getMarket(
        uint256 id
    )
        external
        view
        override
        returns (
            ISapienceStructs.MarketData memory marketData,
            ISapienceStructs.MarketParams memory params
        )
    {
        Market.Data storage market = Market.load(id);
        marketData = ISapienceStructs.MarketData({
            marketId: market.id,
            startTime: market.startTime,
            endTime: market.endTime,
            pool: address(market.pool),
            quoteToken: address(market.quoteToken),
            baseToken: address(market.baseToken),
            minPriceD18: market.minPriceD18,
            maxPriceD18: market.maxPriceD18,
            baseAssetMinPriceTick: market.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: market.baseAssetMaxPriceTick,
            settled: market.settled,
            settlementPriceD18: market.settlementPriceD18,
            assertionId: market.assertionId,
            claimStatement: market.claimStatement
        });

        return (marketData, market.marketParams);
    }

    function getLatestMarket()
        external
        view
        override
        returns (
            ISapienceStructs.MarketData memory marketData,
            ISapienceStructs.MarketParams memory params
        )
    {
        uint256 marketId = MarketGroup.load().lastMarketId;

        if (marketId == 0) {
            revert Errors.NoMarketsCreated();
        }
        Market.Data storage market = Market.load(marketId);
        marketData = ISapienceStructs.MarketData({
            marketId: marketId,
            startTime: market.startTime,
            endTime: market.endTime,
            pool: address(market.pool),
            quoteToken: address(market.quoteToken),
            baseToken: address(market.baseToken),
            minPriceD18: market.minPriceD18,
            maxPriceD18: market.maxPriceD18,
            baseAssetMinPriceTick: market.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: market.baseAssetMaxPriceTick,
            settled: market.settled,
            settlementPriceD18: market.settlementPriceD18,
            assertionId: market.assertionId,
            claimStatement: market.claimStatement
        });

        return (marketData, market.marketParams);
    }

    function getPosition(
        uint256 positionId
    ) external pure override returns (Position.Data memory) {
        return Position.load(positionId);
    }

    function getPositionSize(
        uint256 positionId
    ) external view override returns (int256) {
        Position.Data storage position = Position.load(positionId);
        return position.positionSize();
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getSqrtPriceX96(
        uint256 marketId
    ) external view override returns (uint160 sqrtPriceX96) {
        Market.Data storage market = Market.load(marketId);

        if (!market.settled) {
            (sqrtPriceX96, , , , , , ) = market.pool.slot0();
        }
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getReferencePrice(
        uint256 marketId
    ) external view override returns (uint256 price18Digits) {
        return Market.load(marketId).getReferencePrice();
    }

    function getPositionPnl(
        uint256 positionId
    ) external view override returns (int256 pnl) {
        return Position.load(positionId).getPnl();
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getPositionCollateralValue(
        uint256 positionId
    ) external view override returns (uint256 collateralValue) {
        // Load the position data and ensure it's valid
        Position.Data storage position = Position.loadValid(positionId);

        int256 totalNetValue = position.getPnl();

        // Get the deposited collateral amount as an integer
        int256 depositedCollateral = position.depositedCollateralAmount.toInt();

        collateralValue = (depositedCollateral + totalNetValue) > 0
            ? uint256(depositedCollateral + totalNetValue)
            : 0;

        return collateralValue;
    }

    function getMarketGroupTickSpacing() external view override returns (int24) {
        return Market.getTickSpacingForFee(MarketGroup.load().marketParams.feeRate);
    }

    function getDecimalPriceFromSqrtPriceX96(
        uint160 sqrtPriceX96
    ) external view override returns (uint256) {
        return DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96);
    }
}
