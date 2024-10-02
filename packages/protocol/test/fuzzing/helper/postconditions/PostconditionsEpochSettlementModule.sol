// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PostconditionsBase.sol";

abstract contract PostconditionsEpochSettlementModule is PostconditionsBase {
    function settleLiquidityPositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            invariant_GLOBAL_02(returnData);
            onFailInvariantsGeneral(returnData);
        }
    }
    function settleTradePositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            invariant_GLOBAL_02(returnData);
            onFailInvariantsGeneral(returnData);
        }
    }
}
