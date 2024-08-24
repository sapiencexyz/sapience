// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/Position.sol";
import {IFoilStructs} from "../interfaces/IFoilStructs.sol";
import {IEpochLiquidityModule} from "../interfaces/IEpochLiquidityModule.sol";

import "forge-std/console2.sol";

contract EpochLiquidityModule is ReentrancyGuard, IEpochLiquidityModule {
    using Position for Position.Data;
    using Epoch for Epoch.Data;

    function createLiquidityPosition(
        IFoilStructs.LiquidityMintParams memory params
    )
        external
        override
        returns (
            uint256 id,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        id = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(id);
        ERC721Storage._mint(msg.sender, id);

        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(params.epochId);
        epoch.validateLp(params.lowerTick, params.upperTick);

        position.updateCollateral(
            market.collateralAsset,
            params.collateralAmount
        );

        (uniswapNftId, liquidity, addedAmount0, addedAmount1) = market
            .uniswapPositionManager
            .mint(
                INonfungiblePositionManager.MintParams({
                    token0: address(epoch.gasToken),
                    token1: address(epoch.ethToken),
                    fee: epoch.params.feeRate,
                    tickLower: params.lowerTick,
                    tickUpper: params.upperTick,
                    amount0Desired: params.amountTokenA,
                    amount1Desired: params.amountTokenB,
                    amount0Min: params.minAmountTokenA,
                    amount1Min: params.minAmountTokenB,
                    recipient: address(this),
                    deadline: block.timestamp
                })
            );

        position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: uniswapNftId,
                liquidity: liquidity,
                additionalLoanAmount0: addedAmount0,
                additionalLoanAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick,
                tokensOwed0: 0,
                tokensOwed1: 0
            })
        );

        // emit event
        emit LiquidityPositionCreated(
            id,
            params.collateralAmount,
            liquidity,
            addedAmount0,
            addedAmount1,
            params.lowerTick,
            params.upperTick
        );
    }

    function decreaseLiquidityPosition(
        IFoilStructs.LiquidityDecreaseParams memory params
    ) external override returns (uint256 amount0, uint256 amount1) {
        DecreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.load(params.positionId);
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        if (position.kind != IFoilStructs.PositionKind.Liquidity) {
            revert Errors.InvalidPositionKind();
        }

        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,

        ) = _getCurrentPoolTokenAmounts(market, epoch, position);

        stack.decreaseParams = INonfungiblePositionManager
            .DecreaseLiquidityParams({
                tokenId: position.uniswapPositionId,
                liquidity: params.liquidity,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: block.timestamp
            });

        (amount0, amount1) = market.uniswapPositionManager.decreaseLiquidity(
            stack.decreaseParams
        );

        position.updateCollateral(
            market.collateralAsset,
            params.collateralAmount
        );

        // get tokens owed
        (, , , , , , , , , , stack.tokensOwed0, stack.tokensOwed1) = market
            .uniswapPositionManager
            .positions(position.uniswapPositionId);

        position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: params.liquidity,
                additionalLoanAmount0: 0, // tokensOwed0 represents the returned tokens
                additionalLoanAmount1: 0, // tokensOwed1 represents the returned tokens
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0,
                tokensOwed1: stack.tokensOwed1
            })
        );

        emit LiquidityPositionDecreased(
            position.id,
            params.collateralAmount,
            params.liquidity,
            amount0,
            amount1
        );
    }

    function increaseLiquidityPosition(
        IFoilStructs.LiquidityIncreaseParams memory params
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        IncreaseLiquidityPositionStack memory stack;

        Market.Data storage market = Market.load();
        Position.Data storage position = Position.load(params.positionId);
        Epoch.Data storage epoch = Epoch.load(position.epochId);

        if (position.kind != IFoilStructs.PositionKind.Liquidity) {
            revert Errors.InvalidPositionKind();
        }

        (
            stack.previousAmount0,
            stack.previousAmount1,
            stack.lowerTick,
            stack.upperTick,

        ) = _getCurrentPoolTokenAmounts(market, epoch, position);

        stack.increaseParams = INonfungiblePositionManager
            .IncreaseLiquidityParams({
                tokenId: position.id,
                amount0Desired: params.gasTokenAmount,
                amount1Desired: params.ethTokenAmount,
                amount0Min: params.minGasAmount,
                amount1Min: params.minEthAmount,
                deadline: block.timestamp
            });

        (liquidity, amount0, amount1) = market
            .uniswapPositionManager
            .increaseLiquidity(stack.increaseParams);

        position.updateCollateral(
            market.collateralAsset,
            params.collateralAmount
        );

        // get tokens owed
        (, , , , , , , , , , stack.tokensOwed0, stack.tokensOwed1) = market
            .uniswapPositionManager
            .positions(position.uniswapPositionId);

        position.updateValidLp(
            epoch,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: liquidity,
                additionalLoanAmount0: amount0, // these are the added tokens to the position
                additionalLoanAmount1: amount1,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0,
                tokensOwed1: stack.tokensOwed1
            })
        );

        emit LiquidityPositionIncreased(
            position.id,
            params.collateralAmount,
            liquidity,
            amount0,
            amount1
        );
    }

    function getTokenAmounts(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        external
        view
        override
        returns (uint256 amount0, uint256 amount1, uint128 liquidity)
    {
        Epoch.Data storage epoch = Epoch.load(epochId);

        // calculate for unit
        uint128 unitLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            1e18,
            1e18
        );

        (uint256 unitAmount0, uint256 unitAmount1) = LiquidityAmounts
            .getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96,
                unitLiquidity
            );

        uint256 requiredCollateral = epoch.requiredCollateralForLiquidity(
            unitLiquidity,
            unitAmount0,
            unitAmount1,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        // scale up for fractional collateral ratio
        uint256 collateralRatio = FullMath.mulDiv(
            depositedCollateralAmount,
            1e18, // Create MathUtil and use UNIT
            requiredCollateral
        );

        // scale up liquidity by collateral amount
        return (
            FullMath.mulDiv(unitAmount0, collateralRatio, 1e18),
            FullMath.mulDiv(unitAmount1, collateralRatio, 1e18),
            uint128(unitLiquidity * collateralRatio) / 1e18
        );
    }

    function _getCurrentPoolTokenAmounts(
        Market.Data storage market,
        Epoch.Data storage epoch,
        Position.Data storage position
    )
        internal
        view
        returns (
            uint256 amount0,
            uint256 amount1,
            int24 lowerTick,
            int24 upperTick,
            uint128 liquidity
        )
    {
        // get liquidity given tokenId
        (, , , , , lowerTick, upperTick, liquidity, , , , ) = market
            .uniswapPositionManager
            .positions(position.uniswapPositionId);
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epoch.pool).slot0();
        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );
    }
}
