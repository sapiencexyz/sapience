// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@perimetersec/fuzzlib/src/FuzzBase.sol";
import "../FuzzSetup.sol";
import "../util/FunctionCalls.sol";
import "../../../src/contracts/storage/Position.sol";

contract FoilUniswapCoverage is FuzzBase, FuzzSetup, FunctionCalls {
    using Position for Position.Data;

    function _getPositionCoverage(Position.Data memory position) internal {
        // ID coverage
        if (position.id == 0) {
            fl.log("Position ID is zero");
        } else if (position.id <= 10) {
            fl.log("Position ID is between 1 and 10");
        } else {
            fl.log("Position ID is greater than 1000");
        }

        // Kind coverage
        if (position.kind == IFoilStructs.PositionKind.Trade) {
            fl.log("Position is a Trade position");
        } else if (position.kind == IFoilStructs.PositionKind.Liquidity) {
            fl.log("Position is a Liquidity position");
        } else {
            fl.log("Unknown position kind");
        }

        // Epoch ID coverage
        if (position.epochId == 0) {
            fl.log("Position is not associated with any epoch");
        } else {
            fl.log("Position is associated with an epoch");
        }

        // Deposited collateral coverage
        if (position.depositedCollateralAmount == 0) {
            fl.log("No collateral deposited");
        } else if (position.depositedCollateralAmount <= 1e18) {
            fl.log("Collateral deposited is 1 or less");
        } else if (position.depositedCollateralAmount <= 10e18) {
            fl.log("Collateral deposited is between 1 and 10");
        } else if (position.depositedCollateralAmount <= 100e18) {
            fl.log("Collateral deposited is between 10 and 100");
        } else {
            fl.log("Collateral deposited is more than 100");
        }

        // Borrowed vETH coverage
        if (position.borrowedVEth == 0) {
            fl.log("No vETH borrowed");
        } else if (position.borrowedVEth <= 1e18) {
            fl.log("Borrowed vETH is 1 or less");
        } else if (position.borrowedVEth <= 10e18) {
            fl.log("Borrowed vETH is between 1 and 10");
        } else {
            fl.log("Borrowed vETH is more than 10");
        }

        // Borrowed vGas coverage
        if (position.borrowedVGas == 0) {
            fl.log("No vGas borrowed");
        } else if (position.borrowedVGas <= 1e18) {
            fl.log("Borrowed vGas is 1 or less");
        } else if (position.borrowedVGas <= 10e18) {
            fl.log("Borrowed vGas is between 1 and 10");
        } else {
            fl.log("Borrowed vGas is more than 10");
        }

        // vETH amount coverage
        if (position.vEthAmount == 0) {
            fl.log("No vETH owned");
        } else if (position.vEthAmount <= 1e18) {
            fl.log("Owned vETH is 1 or less");
        } else if (position.vEthAmount <= 10e18) {
            fl.log("Owned vETH is between 1 and 10");
        } else {
            fl.log("Owned vETH is more than 10");
        }

        // vGas amount coverage
        if (position.vGasAmount == 0) {
            fl.log("No vGas owned");
        } else if (position.vGasAmount <= 1e18) {
            fl.log("Owned vGas is 1 or less");
        } else if (position.vGasAmount <= 10e18) {
            fl.log("Owned vGas is between 1 and 10");
        } else {
            fl.log("Owned vGas is more than 10");
        }

        // Uniswap position ID coverage
        if (position.uniswapPositionId == 0) {
            fl.log("No associated Uniswap position");
        } else {
            fl.log("Has associated Uniswap position");
        }

        // Settlement status coverage
        if (position.isSettled) {
            fl.log("Position is settled");
        } else {
            fl.log("Position is not settled");
        }

        // Additional complex scenarios
        if (position.borrowedVEth > 0 && position.borrowedVGas > 0) {
            fl.log("Position has borrowed both vETH and vGas");
        }

        if (position.vEthAmount > 0 && position.vGasAmount > 0) {
            fl.log("Position owns both vETH and vGas");
        }

        if (position.borrowedVEth > position.vEthAmount) {
            fl.log("Borrowed vETH exceeds owned vETH");
        }

        if (position.borrowedVGas > position.vGasAmount) {
            fl.log("Borrowed vGas exceeds owned vGas");
        }

        if (
            position.isSettled &&
            (position.borrowedVEth > 0 || position.borrowedVGas > 0)
        ) {
            fl.log("Position is settled but still has borrowed tokens");
        }
    }

    function _getLiquidityRangeCoverage() internal {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
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

            (success, returnData) = _getCurrentEpochTicksCall(epochId);
            if (success) {
                (int24 minEpochTick, int24 maxEpochTick) = abi.decode(
                    returnData,
                    (int24, int24)
                );

                if (
                    minEpochTick >= CURRENT_MIN_TICK &&
                    maxEpochTick <= CURRENT_MAX_TICK
                ) {
                    fl.log("Epoch range is within current range");
                } else if (
                    minEpochTick < CURRENT_MIN_TICK &&
                    maxEpochTick > CURRENT_MAX_TICK
                ) {
                    fl.log("Epoch range exceeds current range on both sides");
                } else if (minEpochTick < CURRENT_MIN_TICK) {
                    fl.log(
                        "Epoch range exceeds current range on the lower side"
                    );
                } else if (maxEpochTick > CURRENT_MAX_TICK) {
                    fl.log(
                        "Epoch range exceeds current range on the upper side"
                    );
                }

                // Check the size of the current range
                int24 currentRangeSize = CURRENT_MAX_TICK - CURRENT_MIN_TICK;
                if (currentRangeSize <= 200) {
                    fl.log("Current range is very narrow (<=200 ticks)");
                } else if (currentRangeSize <= 1000) {
                    fl.log("Current range is narrow (201-1000 ticks)");
                } else if (currentRangeSize <= 10000) {
                    fl.log("Current range is medium (1001-10000 ticks)");
                } else {
                    fl.log("Current range is wide (>10000 ticks)");
                }

                //Should not be covered
                if (minEpochTick == maxEpochTick) {
                    fl.log("Epoch has zero width");
                }
                if (minEpochTick > maxEpochTick) {
                    fl.log(
                        "Invalid epoch range: min tick greater than max tick"
                    );
                }
            }
        }
    }
}
