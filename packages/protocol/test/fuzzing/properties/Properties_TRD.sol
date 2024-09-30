// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PropertiesBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract Properties_TRD is PropertiesBase {
    function invariant_TRADE_01() internal {
        (, uint[] memory tradePositions) = getAllPositionsIdsOfAllUsers(
            getLatestEpoch()
        );

        for (uint i = 0; i < tradePositions.length; i++) {
            PositionDataExpanded memory position = states[1].tradePositions[
                tradePositions[i]
            ];
            if (!position.positionData.isSettled) {
                fl.gte(position.collateral, position.debt, TRADE_01);
            }
        }
    }

    function invariant_TRADE_02() internal {
        (, uint[] memory tradePositions) = getAllPositionsIdsOfAllUsers(
            getLatestEpoch()
        );

        for (uint i = 0; i < tradePositions.length; i++) {
            PositionDataExpanded memory position = states[1].tradePositions[
                tradePositions[i]
            ];

            if (position.positionData.vGasAmount > 0) {
                if (
                    position.positionData.borrowedVGas > 0 ||
                    position.positionData.vEthAmount > 0
                ) {
                    fl.log(
                        "TRADE_02::borrowedVGas",
                        position.positionData.borrowedVGas
                    );
                    fl.log(
                        "TRADE_02::vEthAmount",
                        position.positionData.vEthAmount
                    );
                }
                fl.t(
                    position.positionData.borrowedVGas == 0 &&
                        position.positionData.vEthAmount == 0,
                    TRADE_02
                );
            }

            if (position.positionData.vEthAmount > 0) {
                if (
                    position.positionData.borrowedVEth > 0 ||
                    position.positionData.vGasAmount > 0
                ) {
                    fl.log(
                        "TRADE_02::borrowedVGas",
                        position.positionData.borrowedVEth
                    );
                    fl.log(
                        "TRADE_02::vEthAmount",
                        position.positionData.vGasAmount
                    );
                }
                fl.t(
                    position.positionData.borrowedVEth == 0 &&
                        position.positionData.vGasAmount == 0,
                    TRADE_03
                );
            }
        }
    }
}
