// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../storage/Epoch.sol";
import "../external/univ3/TickMath.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "../external/univ3/MigrationMathUtils.sol";

library UniV3Abstraction {
    using MigrationMathUtils for uint256;
    using MigrationMathUtils for int256;
    using Epoch for Epoch.Data;

    uint256 internal constant _DUST = 10;

    function addLiquidity(
        address recipient,
        address pool,
        int24 lowerTick,
        int24 upperTick,
        uint256 vEthAmount,
        Epoch.Data storage epoch
    ) external returns (uint256 amount0, uint256 amount1, uint128 liquidity) {
        (uint160 sqrtRatioX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        // get the equivalent amount of liquidity from amount0 & amount1 with current price
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(lowerTick),
            TickMath.getSqrtRatioAtTick(upperTick),
            vEthAmount,
            0
        );

        (amount0, amount1) = IUniswapV3Pool(pool).mint(
            recipient,
            lowerTick,
            upperTick,
            liquidity,
            abi.encodePacked(msg.sender)
        );

        return (amount0, amount1, liquidity);
    }

    function removeLiquidity(
        address recipient,
        address pool,
        int24 lowerTick,
        int24 upperTick,
        uint128 liquidity
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
        (amount0Burned, amount1Burned) = IUniswapV3Pool(pool).burn(
            lowerTick,
            upperTick,
            liquidity
        );

        // then we can collect the tokens owed (include fees)
        (amount0Collected, amount1Collected) = IUniswapV3Pool(pool).collect(
            address(this),
            lowerTick,
            upperTick,
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

    function swap(
        uint160 accountId,
        address pool,
        bool amountIsInput,
        bool isVEthToVGas,
        uint256 amount,
        uint160 sqrtPriceLimitX96,
        bool shouldMint
    ) external returns (uint256 amountVEth, uint256 amountVGas) {
        // sign of amount determines if it's exact input or not
        int256 amountSpecified = amountIsInput
            ? int256(amount)
            : int256(-1 * amount.toInt());

        // returned amounts are delta amounts, as seen by the pool, not the user
        // > 0: pool gets; user pays
        (int256 signedAmountVEth, int256 signedAmountVGas) = IUniswapV3Pool(
            pool
        ).swap(
                address(this),
                isVEthToVGas, // direction of swap
                amountSpecified,
                sqrtPriceLimitX96 == 0
                    ? (
                        isVEthToVGas
                            ? TickMath.MIN_SQRT_RATIO + 1
                            : TickMath.MAX_SQRT_RATIO - 1
                    )
                    : sqrtPriceLimitX96,
                abi.encodePacked(accountId, shouldMint)
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
        uint256 exactAmount = amountIsInput == isVEthToVGas ? amount0 : amount1;

        // if no price limit, require the full output amount as it's technically possible for amounts to not match
        if (!amountIsInput && sqrtPriceLimitX96 == 0) {
            require(
                (
                    exactAmount > amount
                        ? exactAmount - amount
                        : amount - exactAmount
                ) < _DUST,
                "???"
            );
            return isVEthToVGas ? (amount0, amount) : (amount, amount1);
        }

        return (amount0, amount1);
    }
}
