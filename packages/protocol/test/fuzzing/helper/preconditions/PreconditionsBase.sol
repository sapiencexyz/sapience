// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "../BeforeAfter.sol";
import "@perimetersec/fuzzlib/src/FuzzLibString.sol";
import {TickMath} from "../../../../src/contracts/external/univ3/TickMath.sol";

/* solhint-disable meta-transactions/no-msg-sender */

abstract contract PreconditionsBase is BeforeAfter {
    event Clamped(string);

    modifier setCurrentActor() {
        if (_setActor) {
            if (REPRO_MODE) {
                currentActor = USER1; //foundry repros
            } else {
                currentActor = USERS[block.timestamp % (USERS.length)];
            }
            vm.prank(currentActor);
        }
        _;
    }

    function getTokenAmountsForCollateralAmount(
        uint256 collateralAmount,
        int24 lowerTick,
        int24 upperTick
    )
        internal
        returns (uint256 loanAmount0, uint256 loanAmount1, uint256 liquidity)
    {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        require(success);

        (uint256 epochId, , , address pool, , , , , , , ) = abi.decode(
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

        uint160 sqrtPriceAX96 = uint160(TickMath.getSqrtRatioAtTick(lowerTick));
        uint160 sqrtPriceBX96 = uint160(TickMath.getSqrtRatioAtTick(upperTick));

        (success, returnData) = _getTokenAmountsCall(
            epochId,
            collateralAmount,
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        require(success);

        (loanAmount0, loanAmount1, liquidity) = abi.decode(
            returnData,
            (uint256, uint256, uint256)
        );
    }

    //based on @fuzzlib
    function clampInt24(
        int24 value,
        int24 low,
        int24 high,
        bool enableLogs
    ) internal returns (int24) {
        if (value < low || value > high) {
            uint24 range = uint24(uint24(high) - uint24(low) + 1);
            int24 clamped = int24(
                uint24((uint24(value) - uint24(low)) % range)
            );
            int24 ans = int24(uint24(low) + uint24(clamped));
            if (enableLogs) {
                string memory valueStr = FuzzLibString.toString(int256(value));
                string memory ansStr = FuzzLibString.toString(int256(ans));
                bytes memory message = abi.encodePacked(
                    "Clamping value ",
                    valueStr,
                    " to ",
                    ansStr
                );
                emit Clamped(string(message));
            }
            return ans;
        }
        return value;
    }

    function clampInt128(
        int128 value,
        int128 low,
        int128 high,
        bool enableLogs
    ) internal returns (int128) {
        if (value < low || value > high) {
            uint128 range = uint128(uint128(high) - uint128(low) + 1);
            int128 clamped = int128(
                uint128((uint128(value) - uint128(low)) % range)
            );
            int128 ans = int128(uint128(low) + uint128(clamped));
            if (enableLogs) {
                string memory valueStr = FuzzLibString.toString(int256(value));
                string memory ansStr = FuzzLibString.toString(int256(ans));
                bytes memory message = abi.encodePacked(
                    "Clamping value ",
                    valueStr,
                    " to ",
                    ansStr
                );
                emit Clamped(string(message));
            }
            return ans;
        }
        return value;
    }

    function addPosition(
        uint epochId,
        address user,
        uint positionId,
        bool isLiquidity
    ) internal {
        if (isLiquidity) {
            userLiquidityPositions[epochId][user].push(positionId);
        } else {
            userTradePositions[epochId][user].push(positionId);
        }
    }

    function deletePosition(
        uint epochId,
        address user,
        uint positionId,
        bool isLiquidity
    ) internal {
        uint[] storage positions = isLiquidity
            ? userLiquidityPositions[epochId][user]
            : userTradePositions[epochId][user];
        for (uint i = 0; i < positions.length; i++) {
            if (positions[i] == positionId) {
                positions[i] = positions[positions.length - 1];
                positions.pop();
                break;
            }
        }
    }

    function removeAssertion(bytes32 assertionId) internal {
        bytes32[] storage assertions = userAssertions[getLatestEpoch()];
        for (uint256 i = 0; i < assertions.length; i++) {
            if (assertions[i] == assertionId) {
                assertions[i] = assertions[assertions.length - 1];
                assertions.pop();
                break;
            }
        }
    }

    function getRandomPositionId(
        address user,
        uint256 seed,
        bool isLiquidity
    ) internal returns (uint) {
        uint currentEpoch = getLatestEpoch();
        uint[] storage positions = isLiquidity
            ? userLiquidityPositions[currentEpoch][user]
            : userTradePositions[currentEpoch][user];

        require(positions.length > 0, "User has no positions");

        uint index = seed % positions.length;
        return positions[index];
    }

    function roundUpToNearestValidTick(
        int24 tick,
        int24 tickSpacing
    ) internal pure returns (int24) {
        if (tick < 0) {
            return int24((tick - tickSpacing + 1) / tickSpacing) * tickSpacing;
        } else {
            return int24((tick + tickSpacing - 1) / tickSpacing) * tickSpacing;
        }
    }

    function getRandomSqrtPriceX96(
        uint160 seed,
        int24 minTick,
        int24 maxTick
    ) internal returns (uint160) {
        require(
            minTick >= CURRENT_MIN_TICK && maxTick <= CURRENT_MAX_TICK,
            "Ticks out of range"
        );
        uint24 tickCount = uint24((maxTick - minTick) / 200) + 1;
        uint24 randomTickIndex = uint24(
            uint256(keccak256(abi.encodePacked(seed))) % tickCount
        );
        int24 randomTick = minTick + int24(randomTickIndex * 200);
        return TickMath.getSqrtRatioAtTick(randomTick);
    }

    function checkIfTraderPushedPriceOutsideOfBoundaries()
        internal
        returns (bool)
    {
        (bool success, bytes memory returnData) = _getLatestEpochCall();

        (uint256 epochId, , , address pool, , , , , , , ) = abi.decode(
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

        (success, returnData) = _getCurrentEpochSqrtPriceX96MaxMinCall(epochId);

        (uint160 sqrtPriceMinX96, uint160 sqrtPriceMaxX96) = abi.decode(
            returnData,
            (uint160, uint160)
        );
        fl.log(
            "sqrtPriceX96 < sqrtPriceMinX96",
            sqrtPriceX96 < sqrtPriceMinX96
        );
        fl.log(
            "sqrtPriceX96 > sqrtPriceMaxX96",
            sqrtPriceX96 > sqrtPriceMaxX96
        );
        if (sqrtPriceX96 < sqrtPriceMinX96 || sqrtPriceX96 > sqrtPriceMaxX96) {
            return true;
        }
    }

    function settleAllPositions() internal {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
            //epoch should be created
            (uint epochId, , , address pool, , , , , bool settled, , ) = abi
                .decode(
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
            if (settled == true) {
                (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool)
                    .slot0();

                (
                    uint[] memory liquidityPositions,
                    uint[] memory tradePositions
                ) = getAllPositionsIdsOfAllUsers(epochId);

                for (uint i = 0; i < liquidityPositions.length; i++) {
                    (success, returnData) = _getPositionCall(
                        liquidityPositions[i]
                    );

                    Position.Data memory positionData = abi.decode(
                        returnData,
                        (Position.Data)
                    );
                    if (positionData.kind != IFoilStructs.PositionKind(0)) {
                        (success, returnData) = _getPositionOwnerCall(
                            positionData.id
                        );
                        assert(success);

                        vm.prank(abi.decode(returnData, (address)));
                        (success, returnData) = foil.call(
                            abi.encodeWithSelector(
                                epochSettlementModuleImpl
                                    .settlePosition
                                    .selector,
                                positionData.id
                            )
                        );
                        fl.log("Liquidity position");
                        fl.log("Position ID", positionData.id);
                        //NOTE: excluded in remediations
                        // fl.t(
                        //     success,
                        //     "SETTLE-01, It should always be possible to settle all trade positions after the epoch is settled."
                        // );
                    }
                }

                for (uint i = 0; i < tradePositions.length; i++) {
                    (success, returnData) = _getPositionCall(tradePositions[i]);
                    Position.Data memory positionData = abi.decode(
                        returnData,
                        (Position.Data)
                    );

                    if (positionData.kind != IFoilStructs.PositionKind(0)) {
                        (success, returnData) = _getPositionOwnerCall(
                            positionData.id
                        );
                        assert(success);

                        vm.prank(abi.decode(returnData, (address)));

                        (success, returnData) = foil.call(
                            abi.encodeWithSelector(
                                epochSettlementModuleImpl
                                    .settlePosition
                                    .selector,
                                positionData.id
                            )
                        );

                        fl.log("Trade position");
                        fl.log("Position ID", positionData.id);
                        //NOTE: excluded in remediations
                        // fl.t(
                        //     success,
                        //     "SETTLE-01, It should always be possible to settle all liquidity positions after the epoch is settled."
                        // );
                    }
                }
            }
        }
    }
    function isPositionTypeTrade(uint positionId) internal returns (bool) {
        //NOTE: will return false if position type unknown
        (bool success, bytes memory returnData) = _getPositionCall(positionId);
        fl.t(success, "Unable to get position");
        Position.Data memory position = abi.decode(returnData, (Position.Data));

        if (position.kind == IFoilStructs.PositionKind.Trade) {
            return true;
        }
        return false;
    }
}
