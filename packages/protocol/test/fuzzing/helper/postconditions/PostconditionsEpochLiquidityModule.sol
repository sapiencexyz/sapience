// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PostconditionsBase.sol";

abstract contract PostconditionsEpochLiquidityModule is PostconditionsBase {
    function createLiquidityPositionPostconditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_LIQUID_01();
            invariant_LIQUID_02();
            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function decreaseLiquidityPositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_LIQUID_01();
            invariant_LIQUID_02();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function increaseLiquidityPositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_LIQUID_01();
            invariant_LIQUID_02();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function closeLiquidityPositionPostConditions(
        bool success,
        bytes memory returnData,
        address[] memory actorsToUpdate
    ) internal {
        if (success) {
            _after(actorsToUpdate);
            invariant_LIQUID_01();

            onSuccessInvariantsGeneral(returnData, actorsToUpdate[0]);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }

    function closeAllLiquidityPositionsPostConditions(
        bool success,
        bytes memory returnData
    ) internal {
        if (success) {
            address[] memory actorsToUpdate = new address[](0);
            _after(actorsToUpdate);
            invariant_LIQUID_03();
            onSuccessInvariantsGeneral(returnData, currentActor);
        } else {
            onFailInvariantsGeneral(returnData);
        }
    }
}
