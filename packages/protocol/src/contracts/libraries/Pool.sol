// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "../external/univ3/TickMath.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";
import "../storage/Position.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";

library Pool {
    function getCurrentPositionTokenAmounts(
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
        (, , , , , lowerTick, upperTick, liquidity, , , , ) = INonfungiblePositionManager(epoch.params
            .uniswapPositionManager)
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
