// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "../external/univ3/TickMath.sol";
import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import "../storage/Position.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";

library Pool {
    function getCurrentPositionTokenAmounts(
        Market.Data storage market,
        Position.Data storage position
    )
        internal
        view
        returns (
            uint256 amount0,
            uint256 amount1,
            int24 lowerTick,
            int24 upperTick,
            uint128 liquidity,
            uint256 tokensOwed0,
            uint256 tokensOwed1
        )
    {
        uint128 tokensOwed0U128;
        uint128 tokensOwed1U128;
        // get liquidity given tokenId
        (
            ,
            ,
            ,
            ,
            ,
            lowerTick,
            upperTick,
            liquidity,
            ,
            ,
            tokensOwed0U128,
            tokensOwed1U128
        ) = INonfungiblePositionManager(
            market.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(market.pool).slot0();
        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (amount0, amount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );
        tokensOwed0 = uint256(tokensOwed0U128);
        tokensOwed1 = uint256(tokensOwed1U128);
    }
}
