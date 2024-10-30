// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Epoch.sol";
import "../storage/Position.sol";
import "../storage/Trade.sol";
import "../interfaces/IViewsModule.sol";
import "../interfaces/IFoilStructs.sol";

contract ViewsModule is IViewsModule {
    using Position for Position.Data;

    function getMarket()
        external
        view
        override
        returns (
            address owner,
            address collateralAsset,
            address feeCollectorNFT,
            address callbackRecipient,
            IFoilStructs.MarketParams memory marketParams
        )
    {
        Market.Data storage market = Market.load();
        return (
            market.owner,
            address(market.collateralAsset),
            address(market.feeCollectorNFT),
            address(market.callbackRecipient),
            market.marketParams
        );
    }

    function getEpoch(
        uint256 id
    )
        external
        view
        override
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory params
        )
    {
        Epoch.Data storage epoch = Epoch.load(id);
        epochData = IFoilStructs.EpochData({
            epochId: epoch.id,
            startTime: epoch.startTime,
            endTime: epoch.endTime,
            pool: address(epoch.pool),
            ethToken: address(epoch.ethToken),
            gasToken: address(epoch.gasToken),
            minPriceD18: epoch.minPriceD18,
            maxPriceD18: epoch.maxPriceD18,
            baseAssetMinPriceTick: epoch.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: epoch.baseAssetMaxPriceTick,
            settled: epoch.settled,
            settlementPriceD18: epoch.settlementPriceD18
        });

        return (epochData, epoch.marketParams);
    }

    function getLatestEpoch()
        external
        view
        override
        returns (
            IFoilStructs.EpochData memory epochData,
            IFoilStructs.MarketParams memory params
        )
    {
        uint256 epochId = Market.load().lastEpochId;

        if (epochId == 0) {
            revert Errors.NoEpochsCreated();
        }
        Epoch.Data storage epoch = Epoch.load(epochId);
        epochData = IFoilStructs.EpochData({
            epochId: epochId,
            startTime: epoch.startTime,
            endTime: epoch.endTime,
            pool: address(epoch.pool),
            ethToken: address(epoch.ethToken),
            gasToken: address(epoch.gasToken),
            minPriceD18: epoch.minPriceD18,
            maxPriceD18: epoch.maxPriceD18,
            baseAssetMinPriceTick: epoch.baseAssetMinPriceTick,
            baseAssetMaxPriceTick: epoch.baseAssetMaxPriceTick,
            settled: epoch.settled,
            settlementPriceD18: epoch.settlementPriceD18
        });

        return (epochData, epoch.marketParams);
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
        uint256 epochId
    ) external view override returns (uint160 sqrtPriceX96) {
        Epoch.Data storage epoch = Epoch.load(epochId);

        if (!epoch.settled) {
            (sqrtPriceX96, , , , , , ) = epoch.pool.slot0();
        }
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getReferencePrice(
        uint256 epochId
    ) external view override returns (uint256 price18Digits) {
        return Trade.getReferencePrice(epochId);
    }

    /**
     * @inheritdoc IViewsModule
     */
    function getPositionCollateralValue(
        uint256 positionId
    ) external view override returns (uint256 collateralValue) {
        // Load the position data and ensure it's valid
        Position.Data storage position = Position.loadValid(positionId);

        // Load the epoch data associated with the position
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        // Determine the appropriate price
        uint256 gasPriceD18;
        if (position.isSettled) {
            gasPriceD18 = epoch.settlementPriceD18;
        } else {
            gasPriceD18 = Trade.getReferencePrice(epoch.id);
        }

        // Initialize net virtual GAS and ETH positions
        int256 netVGAS;
        int256 netVETH;

        // If the position is a Liquidity Provider (LP) position
        if (position.kind == IFoilStructs.PositionKind.Liquidity) {
            // Get the current amounts and fees owed from the Uniswap position manager
            (
                uint256 amount0,
                uint256 amount1
            ) = _getCurrentPositionTokenAmounts(position, epoch);

            // Add these amounts to the position's vGasAmount and vEthAmount
            uint256 totalVGAS = position.vGasAmount + amount0;
            uint256 totalVETH = position.vEthAmount + amount1;

            netVGAS = int256(totalVGAS) - int256(position.borrowedVGas);
            netVETH = int256(totalVETH) - int256(position.borrowedVEth);
        } else {
            // For trader positions, use the stored values
            netVGAS =
                int256(position.vGasAmount) -
                int256(position.borrowedVGas);
            netVETH =
                int256(position.vEthAmount) -
                int256(position.borrowedVEth);
        }

        // Calculate the net value of virtual GAS holdings in ETH terms
        int256 netVGASValue = (netVGAS * int256(gasPriceD18)) / int256(1e18);

        // Total net value in ETH terms
        uint256 totalNetValue = (netVETH + netVGASValue) > 0
            ? uint256(netVETH + netVGASValue)
            : 0;

        // Get the deposited collateral amount as an integer
        uint256 depositedCollateral = position.depositedCollateralAmount;

        // Collateral value is the sum of deposited collateral and the net value of virtual holdings
        collateralValue = depositedCollateral + totalNetValue;

        return collateralValue;
    }

    function _getCurrentPositionTokenAmounts(
        Position.Data storage position,
        Epoch.Data storage epoch
    ) internal view returns (uint256 amount0, uint256 amount1) {
        // Ensure the position is an LP position
        require(
            position.kind == IFoilStructs.PositionKind.Liquidity,
            "Not an LP position"
        );

        // Fetch position info from Uniswap V3 position manager
        (
            ,
            ,
            ,
            ,
            ,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            ,
            ,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ) = INonfungiblePositionManager(
                epoch.marketParams.uniswapPositionManager
            ).positions(position.uniswapPositionId);

        // Get the current sqrt price from the pool
        (uint160 sqrtPriceX96, , , , , , ) = epoch.pool.slot0();

        // Calculate the amounts of token0 and token1 represented by the liquidity
        (uint256 amount0Liquidity, uint256 amount1Liquidity) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(tickLower),
                TickMath.getSqrtRatioAtTick(tickUpper),
                liquidity
            );

        // Add tokens owed (fees)
        amount0 = amount0Liquidity + uint256(tokensOwed0);
        amount1 = amount1Liquidity + uint256(tokensOwed1);

        return (amount0, amount1);
    }
}
