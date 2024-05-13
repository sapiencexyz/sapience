// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../storage/Epoch.sol";
import "../external/univ3/TickMath.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "../external/univ3/MigrationMathUtils.sol";

library UniV3AbstractionOld {
    using MigrationMathUtils for uint256;
    using MigrationMathUtils for int256;
    using Epoch for Epoch.Data;

    struct RuntimeAddLiquidityParams {
        address recipient;
        address pool;
        int24 lowerTick;
        int24 upperTick;
        uint256 collateralAmount;
    }

    uint256 internal constant _DUST = 10;

    function addLiquidity(
        RuntimeAddLiquidityParams memory params
    ) external returns (uint256 amount0, uint256 amount1, uint128 liquidity) {
        (uint160 sqrtRatioX96, , , , , , ) = IUniswapV3Pool(params.pool)
            .slot0();

        // get the equivalent amount of liquidity from amount0 & amount1 with current price
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(params.lowerTick),
            TickMath.getSqrtRatioAtTick(params.upperTick),
            params.collateralAmount,
            0
        );

        (amount0, amount1) = IUniswapV3Pool(params.pool).mint(
            params.recipient,
            params.lowerTick,
            params.upperTick,
            liquidity,
            abi.encodePacked(msg.sender)
        );

        return (amount0, amount1, liquidity);
    }

    struct RuntimeRemoveLiquidityParams {
        address recipient;
        address pool;
        int24 lowerTick;
        int24 upperTick;
        uint128 liquidity;
    }

    function removeLiquidity(
        RuntimeRemoveLiquidityParams memory params
    )
        external
        returns (
            uint256 amount0Burned,
            uint256 amount1Burned,
            uint128 amount0Collected,
            uint128 amount1Collected
        )
    {
        // first we need to burn the liquidity to update the pool's state (tokensOwed)
        (amount0Burned, amount1Burned) = IUniswapV3Pool(params.pool).burn(
            params.lowerTick,
            params.upperTick,
            params.liquidity
        );

        // then we can collect the tokens owed (include fees)
        (amount0Collected, amount1Collected) = IUniswapV3Pool(params.pool)
            .collect(
                address(this),
                params.lowerTick,
                params.upperTick,
                type(uint128).max,
                type(uint128).max
            );

        return (
            amount0Burned,
            amount1Burned,
            amount0Collected,
            amount1Collected
        );
    }

    struct RuntimeSwapParameters {
        uint256 accountId;
        address pool;
        bool amountIsInput;
        bool isVEthToVGas;
        uint256 amount;
        uint160 sqrtPriceLimitX96;
        bool shouldMint;
    }

    function swap(
        RuntimeSwapParameters memory params
    ) external returns (uint256 amountVEth, uint256 amountVGas) {
        // sign of amount determines if it's exact input or not
        int256 amountSpecified = params.amountIsInput
            ? int256(params.amount)
            : int256(-1 * params.amount.toInt());

        // returned amounts are delta amounts, as seen by the pool, not the user
        // > 0: pool gets; user pays
        (int256 signedAmountVEth, int256 signedAmountVGas) = IUniswapV3Pool(
            params.pool
        ).swap(
                address(this),
                params.isVEthToVGas, // direction of swap
                amountSpecified,
                params.sqrtPriceLimitX96 == 0
                    ? (
                        params.isVEthToVGas
                            ? TickMath.MIN_SQRT_RATIO + 1
                            : TickMath.MAX_SQRT_RATIO - 1
                    )
                    : params.sqrtPriceLimitX96,
                abi.encodePacked(params.accountId, params.shouldMint)
            );

        (uint256 amount0, uint256 amount1) = (
            signedAmountVEth.abs(),
            signedAmountVGas.abs()
        );

        // TODO Understand from that point onwards... just copied

        // amountIsInput = true, isVEthToVGas = true => exact vETH
        // amountIsInput = true, isVEthToVGas = false => exact vGas
        // amountIsInput = false, isVEthToVGas = false => exact vETH
        // amountIsInput = false, isVEthToVGas = true => exact vGas
        uint256 exactAmount = params.amountIsInput == params.isVEthToVGas
            ? amount0
            : amount1;

        // if no price limit, require the full output amount as it's technically possible for amounts to not match
        if (!params.amountIsInput && params.sqrtPriceLimitX96 == 0) {
            require(
                (
                    exactAmount > params.amount
                        ? exactAmount - params.amount
                        : params.amount - exactAmount
                ) < _DUST,
                "???"
            );
            return
                params.isVEthToVGas
                    ? (amount0, params.amount)
                    : (params.amount, amount1);
        }

        return (amount0, amount1);
    }
}
