// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../util/FunctionCalls.sol";
import "../FuzzSetup.sol";

import "foilInterfaces/IFoilStructs.sol";
import "foilIStorage/Position.sol";
import "foilILibs/Quote.sol";
import {console2} from "forge-std/Test.sol";
import {FoilUniswapCoverage} from "./FoilUniswapCoverage.sol";

/* solhint-disable numcast/safe-cast */
abstract contract BeforeAfter is FoilUniswapCoverage {
    using Position for Position.Data;

    mapping(uint8 => State) states;

    struct State {
        // account => actorStates
        mapping(uint => ActorStates) actorStates;
        mapping(uint => PositionDataExpanded) tradePositions;
        mapping(uint => PositionDataExpanded) liquidityPositions;
        uint32 secondsInsideLower;
        uint32 secondsInsideUpper;
        uint sumVEth;
        uint sumVGas;
        uint sumVEthMax;
        uint sumVGasMax;
        uint totalBorrowedVGas;
        uint totalHeldVGas;
    }

    struct ActorStates {
        uint variable;
    }

    struct BeforeAfterCache {
        uint amount0;
        uint amount1;
        uint160 sqrtPriceX96;
        uint epochId;
        address pool;
        uint[] liquidityPositions;
        Position.Data positionData;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        uint borrowedVGas;
        uint borrowedVEth;
        uint debt;
        uint collateral;
        uint valueOfLp;
    }
    struct PositionDataExpanded {
        Position.Data positionData;
        uint debt;
        uint collateral;
        uint valueOfLp;
    }
    function _before(address[] memory actors) internal {
        _setStates(0, actors);
    }

    function _after(address[] memory actors) internal {
        _setStates(1, actors);
    }

    function _setStates(uint8 callNum, address[] memory actors) internal {
        checkDebtAndCollateralTrade(callNum);
        checkDebtAndCollateralLiquidity(callNum);
        checkLiquidityRange(callNum);
        checkVTokensSum(callNum);

        for (uint256 i = 0; i < USERS.length; i++) {
            _setActorState(callNum, USERS[i]);
        }
    }

    function _setActorState(uint8 callNum, address actor) internal {}

    function checkDebtAndCollateralTrade(uint8 callNum) internal {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
            (uint epochId, , , address pool, , , , , , , ) = abi.decode(
                returnData,
                (
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    uint256,
                    uint256,
                    bool,
                    uint256,
                    IFoilStructs.EpochParams
                )
            );
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

            (, uint[] memory tradePositions) = getAllPositionsIdsOfAllUsers(
                epochId
            );

            for (uint i = 0; i < tradePositions.length; i++) {
                (success, returnData) = _getPositionCall(tradePositions[i]);

                if (success) {
                    states[callNum]
                        .tradePositions[tradePositions[i]]
                        .positionData = abi.decode(returnData, (Position.Data));

                    _getPositionCoverage(
                        states[callNum]
                            .tradePositions[tradePositions[i]]
                            .positionData
                    );

                    Position.Data memory pos = states[callNum]
                        .tradePositions[tradePositions[i]]
                        .positionData;

                    uint256 activePrice;

                    if (pos.isSettled) {
                        (success, returnData) = _getSettlementPriceCall(
                            epochId
                        );
                        activePrice = abi.decode(returnData, (uint));
                    } else {
                        activePrice = sqrtPriceX96;
                    }

                    states[callNum].tradePositions[tradePositions[i]].debt =
                        pos.borrowedVEth +
                        (
                            pos.isSettled
                                ? quoteEthToGasDecimal(
                                    pos.borrowedVGas,
                                    activePrice
                                )
                                : Quote.quoteGasToEth(
                                    pos.borrowedVGas,
                                    uint160(activePrice)
                                )
                        );

                    states[callNum]
                        .tradePositions[tradePositions[i]]
                        .collateral =
                        pos.depositedCollateralAmount +
                        pos.vEthAmount +
                        (
                            pos.isSettled
                                ? quoteEthToGasDecimal(
                                    pos.vGasAmount,
                                    activePrice
                                )
                                : Quote.quoteGasToEth(
                                    pos.vGasAmount,
                                    uint160(activePrice)
                                )
                        );
                } //NOTE: invariants should check position id != 0
            }
        }
    }

    function checkDebtAndCollateralLiquidity(uint8 callNum) internal {
        states[callNum].totalBorrowedVGas = 0;
        states[callNum].totalHeldVGas = 0;

        BeforeAfterCache memory cache;

        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (!success) return;

        // Decode epoch data
        (cache.epochId, , , cache.pool, , , , , , , ) = abi.decode(
            returnData,
            (
                uint256,
                uint256,
                uint256,
                address,
                address,
                address,
                uint256,
                uint256,
                bool,
                uint256,
                IFoilStructs.EpochParams
            )
        );

        // Get sqrtPriceX96
        (cache.sqrtPriceX96, , , , , , ) = IUniswapV3Pool(cache.pool).slot0();

        // Get all positions
        (cache.liquidityPositions, ) = getAllPositionsIdsOfAllUsers(
            cache.epochId
        );

        for (uint i = 0; i < cache.liquidityPositions.length; i++) {
            (success, returnData) = _getPositionCall(
                cache.liquidityPositions[i]
            );
            if (!success) continue;

            cache.positionData = abi.decode(returnData, (Position.Data));
            states[callNum]
                .liquidityPositions[cache.liquidityPositions[i]]
                .positionData = cache.positionData;
            _getPositionCoverage(
                states[callNum]
                    .liquidityPositions[cache.liquidityPositions[i]]
                    .positionData
            );

            if (cache.positionData.uniswapPositionId == 0) continue;

            // Get tokens owed
            (
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                cache.tokensOwed0,
                cache.tokensOwed1
            ) = _positionManager.positions(
                cache.positionData.uniswapPositionId
            );

            // Calculate borrowed amounts
            cache.borrowedVGas = cache.positionData.borrowedVGas >
                uint(cache.tokensOwed0)
                ? cache.positionData.borrowedVGas - uint(cache.tokensOwed0)
                : 0;

            cache.borrowedVEth = cache.positionData.borrowedVEth >
                uint(cache.tokensOwed1)
                ? cache.positionData.borrowedVEth - uint(cache.tokensOwed1)
                : 0;

            // Calculate debt and collateral
            cache.debt =
                cache.borrowedVEth +
                Quote.quoteGasToEth(cache.borrowedVGas, cache.sqrtPriceX96);
            cache.collateral =
                cache.positionData.depositedCollateralAmount +
                cache.positionData.vEthAmount +
                Quote.quoteGasToEth(
                    cache.positionData.vGasAmount,
                    cache.sqrtPriceX96
                ) +
                cache.tokensOwed1 +
                Quote.quoteGasToEth(cache.tokensOwed0, cache.sqrtPriceX96);

            // Store debt and collateral
            states[callNum]
                .liquidityPositions[cache.liquidityPositions[i]]
                .debt = cache.debt;
            states[callNum]
                .liquidityPositions[cache.liquidityPositions[i]]
                .collateral = cache.collateral;

            // Get position liquidity
            (success, returnData) = _getPositionLiquidityCall(
                cache.positionData.id
            );
            if (!success) continue;

            (cache.amount0, cache.amount1, , , ) = abi.decode(
                returnData,
                (uint256, uint256, int24, int24, uint128)
            );

            cache.valueOfLp =
                cache.amount1 +
                Quote.quoteGasToEth(cache.amount0, cache.sqrtPriceX96);
            states[callNum]
                .liquidityPositions[cache.liquidityPositions[i]]
                .valueOfLp = cache.valueOfLp;

            states[callNum].totalBorrowedVGas += cache
                .positionData
                .borrowedVGas;
            states[callNum].totalHeldVGas += cache.positionData.vGasAmount;
        }
    }

    function checkLiquidityRange(uint8 callNum) internal {
        states[callNum].secondsInsideLower = 0;
        states[callNum].secondsInsideUpper = 0;

        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
            //epoch should be created
            (uint epochId, , , address pool, , , , , , , ) = abi.decode(
                returnData,
                (
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    uint256,
                    uint256,
                    bool,
                    uint256,
                    IFoilStructs.EpochParams
                )
            );
            (bool success, bytes memory returnData) = _getCurrentEpochTicksCall(
                epochId
            );
            assert(success);
            (int24 minEpochTick, int24 maxEpochTick) = abi.decode(
                returnData,
                (int24, int24)
            );
            if (CURRENT_MAX_TICK - CURRENT_MIN_TICK > 200) {
                if (minEpochTick == CURRENT_MIN_TICK) {
                    states[callNum].secondsInsideLower = 0;
                } else {
                    (, , states[callNum].secondsInsideLower) = IUniswapV3Pool(
                        pool
                    ).snapshotCumulativesInside(CURRENT_MIN_TICK, minEpochTick);
                }
                if (maxEpochTick == CURRENT_MAX_TICK) {
                    states[callNum].secondsInsideUpper = 0;
                } else {
                    (, , states[callNum].secondsInsideUpper) = IUniswapV3Pool(
                        pool
                    ).snapshotCumulativesInside(maxEpochTick, CURRENT_MAX_TICK);
                }
            }
        }
        _getLiquidityRangeCoverage();
    }

    function checkVTokensSum(uint8 callNum) internal {
        BeforeAfterCache memory cache;
        states[callNum].sumVEthMax = 0;
        states[callNum].sumVGasMax = 0;
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
            // Decode epoch data
            (cache.epochId, , , cache.pool, , , , , , , ) = abi.decode(
                returnData,
                (
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    uint256,
                    uint256,
                    bool,
                    uint256,
                    IFoilStructs.EpochParams
                )
            );
            // Get sqrtPriceX96
            address vETH = IUniswapV3Pool(cache.pool).token0();
            address vGas = IUniswapV3Pool(cache.pool).token1();

            unchecked {
                ///NOTE: overflow is desirable since we are checking exact number type(uint256).max
                states[callNum].sumVEth =
                    IERC20(vETH).balanceOf(address(foil)) +
                    IERC20(vETH).balanceOf(address(_positionManager)) +
                    IERC20(vETH).balanceOf(address(_v3SwapRouter)) +
                    IERC20(vETH).balanceOf(address(cache.pool));
            }
            unchecked {
                states[callNum].sumVGas =
                    IERC20(vGas).balanceOf(address(foil)) +
                    IERC20(vGas).balanceOf(address(_positionManager)) +
                    IERC20(vGas).balanceOf(address(_v3SwapRouter)) +
                    IERC20(vGas).balanceOf(address(cache.pool));
            }
            states[callNum].sumVEthMax = type(uint256).max;
            states[callNum].sumVGasMax = type(uint256).max;
        }
    }

    //Helpers
    function getEpochData()
        internal
        returns (uint epochId, address pool, uint160 sqrtPriceX96)
    {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        require(success);

        (epochId, , , pool, , , , , , , ) = abi.decode(
            returnData,
            (
                uint256,
                uint256,
                uint256,
                address,
                address,
                address,
                uint256,
                uint256,
                bool,
                uint256,
                IFoilStructs.EpochParams
            )
        );
        (sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
    }

    function getAllPositionsIdsOfAllUsers(
        uint currentEpoch
    )
        internal
        view
        returns (uint[] memory liquidityPositions, uint[] memory tradePositions)
    {
        uint[] memory allLiquidityPositions;
        uint[] memory allTradePositions;

        for (uint i = 0; i < USERS.length; i++) {
            address user = USERS[i];

            uint[] storage userLiquidity = userLiquidityPositions[currentEpoch][
                user
            ];
            allLiquidityPositions = concatArrays(
                allLiquidityPositions,
                userLiquidity
            );

            uint[] storage userTrade = userTradePositions[currentEpoch][user];
            allTradePositions = concatArrays(allTradePositions, userTrade);
        }

        return (allLiquidityPositions, allTradePositions);
    }

    function concatArrays(
        uint[] memory arr1,
        uint[] memory arr2
    ) internal pure returns (uint[] memory) {
        uint[] memory result = new uint[](arr1.length + arr2.length);
        uint i;
        for (i = 0; i < arr1.length; i++) {
            result[i] = arr1[i];
        }
        for (uint j = 0; j < arr2.length; j++) {
            result[i + j] = arr2[j];
        }
        return result;
    }

    function getLatestEpoch() internal returns (uint epochId) {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        require(success);

        (epochId, , , , , , , , , , ) = abi.decode(
            returnData,
            (
                uint256,
                uint256,
                uint256,
                address,
                address,
                address,
                uint256,
                uint256,
                bool,
                uint256,
                IFoilStructs.EpochParams
            )
        );
    }

    function quoteEthToGasDecimal(
        uint256 ethAmount,
        uint256 decimalPrice
    ) internal pure returns (uint256) {
        return FullMath.mulDiv(ethAmount, 1e18, decimalPrice);
    }
}
