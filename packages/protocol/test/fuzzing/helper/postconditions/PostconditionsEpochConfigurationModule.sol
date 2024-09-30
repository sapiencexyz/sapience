// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PostconditionsBase.sol";

abstract contract PostconditionsEpochConfigurationModule is PostconditionsBase {
    function InitializeMarketPostConditions(
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

    function updateMarketPostConditions(
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

    function createEpochPostConditions(
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
