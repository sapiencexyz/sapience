// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PostconditionsBase.sol";

abstract contract PostconditionsEpochTradeModule is PostconditionsBase {
    function createTraderPositionLongPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_TRADE_01();
            invariant_TRADE_02();
            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function createTraderPositionShortPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_TRADE_01();
            invariant_TRADE_02();
            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function modifyTraderPositionLongPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_TRADE_01();
            invariant_TRADE_02();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            invariant_GLOBAL_02(returnData);

            onFailInvariantsGeneral(returnData);
        }
    }

    function modifyTraderPositionShortPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_TRADE_01();
            invariant_TRADE_02();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            invariant_GLOBAL_02(returnData);

            onFailInvariantsGeneral(returnData);
        }
    }

    function closeTraderPositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_TRADE_01();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            invariant_GLOBAL_02(returnData);

            onFailInvariantsGeneral(returnData);
        }
    }
}
