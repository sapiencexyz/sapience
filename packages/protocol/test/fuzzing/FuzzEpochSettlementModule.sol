// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helper/preconditions/PreconditionsEpochSettlementModule.sol";
import "./helper/postconditions/PostconditionsEpochSettlementModule.sol";
import "./util/FunctionCalls.sol";

contract FuzzEpochSettlementModule is
    PreconditionsEpochSettlementModule,
    PostconditionsEpochSettlementModule
{
    function fuzz_settleLiquidityPosition(uint seed) public setCurrentActor {
        uint positionId = settleLiquidityPositionPreconditions(seed);

        uint stateChangerVar = 1; //@audit trick to get a coverage missed with optimizer

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        stateChangerVar = 1 + 1;

        _before(actorsToUpdate);
        (bool success, bytes memory returnData) = _settlePositionCall(
            positionId
        );

        stateChangerVar = 1 * 6;
        settleLiquidityPositionPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
        stateChangerVar = 2 * 8;
    }

    function fuzz_settleTradePosition(uint seed) public setCurrentActor {
        uint positionId = settleTradePositionPreconditions(seed);

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);
        (bool success, bytes memory returnData) = _settlePositionCall(
            positionId
        );

        settleTradePositionPostConditions(success, returnData, actorsToUpdate);
    }
}
