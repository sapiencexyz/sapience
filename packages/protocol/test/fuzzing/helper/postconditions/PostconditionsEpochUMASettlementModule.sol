// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PostconditionsBase.sol";

abstract contract PostconditionsEpochUMASettlementModule is PostconditionsBase {
    function submitSettlementPricePostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function mockDisputeAssertionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }
    function mockSettleAssertionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }
}
