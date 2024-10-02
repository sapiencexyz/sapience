// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PropertiesBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract Properties_LIQ is PropertiesBase {
    function invariant_LIQUID_01() internal {
        (uint[] memory liquidityPositions, ) = getAllPositionsIdsOfAllUsers(
            getLatestEpoch()
        );

        for (uint i = 0; i < liquidityPositions.length; i++) {
            PositionDataExpanded memory position = states[1].liquidityPositions[
                liquidityPositions[i]
            ];
            if (!position.positionData.isSettled) {
                greaterThanOrEqualWithToleranceWei(
                    position.collateral + position.valueOfLp,
                    position.debt,
                    2,
                    LIQUID_01
                );
            }
        }
    }

    function invariant_LIQUID_02() internal {
        (uint[] memory liquidityPositions, ) = getAllPositionsIdsOfAllUsers(
            getLatestEpoch()
        );
        for (uint i = 0; i < liquidityPositions.length; i++) {
            PositionDataExpanded memory positionBefore = states[0]
                .liquidityPositions[liquidityPositions[i]];

            if (!positionBefore.positionData.isSettled) {
                if (
                    positionBefore.positionData.vEthAmount > 0 ||
                    positionBefore.positionData.vGasAmount > 0
                ) {
                    fl.log(
                        "LIQUID_02::vEthAmount",
                        positionBefore.positionData.vEthAmount
                    );
                    fl.log(
                        "LIQUID_02::vGasAmount",
                        positionBefore.positionData.vGasAmount
                    );
                }
                fl.t(
                    positionBefore.positionData.vEthAmount == 0 &&
                        positionBefore.positionData.vGasAmount == 0,
                    LIQUID_02
                );
            }

            PositionDataExpanded memory positionAfter = states[1]
                .liquidityPositions[liquidityPositions[i]];

            if (!positionAfter.positionData.isSettled) {
                if (
                    positionAfter.positionData.vEthAmount > 0 ||
                    positionAfter.positionData.vGasAmount > 0
                ) {
                    fl.log(
                        "LIQUID_02::vEthAmount",
                        positionAfter.positionData.vEthAmount
                    );
                    fl.log(
                        "LIQUID_02::vGasAmount",
                        positionAfter.positionData.vGasAmount
                    );
                }
                fl.t(
                    positionAfter.positionData.vEthAmount == 0 &&
                        positionAfter.positionData.vGasAmount == 0,
                    LIQUID_02
                );
            }
        }
    }

    function invariant_LIQUID_03() internal {
        fl.eq(states[1].totalBorrowedVGas, states[1].totalHeldVGas, LIQUID_03);
    }
}
