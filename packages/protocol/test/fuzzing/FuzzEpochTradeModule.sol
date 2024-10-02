// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helper/preconditions/PreconditionsEpochTradeModule.sol";
import "./helper/postconditions/PostconditionsEpochTradeModule.sol";
import "./util/FunctionCalls.sol";

contract FuzzEpochTradeModule is
    PreconditionsEpochTradeModule,
    PostconditionsEpochTradeModule
{
    function fuzz_createTraderPositionLong(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) public setCurrentActor {
        CreateTraderPositionParams
            memory params = createTraderPositionLongPreconditions(
                collateralAmountSeed,
                tokenAmountSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        (bool success, bytes memory returnData) = _createTraderPositionCall(
            params.epochId,
            params.tokenAmount,
            params.collateralAmount,
            params.deadline
        );

        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //true if pushed
        if (success) {
            addPosition(
                params.epochId,
                currentActor,
                abi.decode(returnData, (uint)), //positionId
                false //bool isLiquidity, trade
            );
        }
        createTraderPositionLongPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_createTraderPositionShort(
        uint collateralAmountSeed,
        uint tokenAmountSeed //positive short token amount for seed
    ) public setCurrentActor {
        CreateTraderPositionParams
            memory params = createTraderPositionShortPreconditions(
                collateralAmountSeed,
                tokenAmountSeed
            );
        uint stateChangerVar = 2 * 8;

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);
        stateChangerVar = 2 * 5;
        (bool success, bytes memory returnData) = _createTraderPositionCall(
            params.epochId,
            params.tokenAmount,
            params.collateralAmount,
            params.deadline
        );
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //true if pushed
        stateChangerVar = 2 * 2;
        if (success) {
            addPosition(
                params.epochId,
                currentActor,
                abi.decode(returnData, (uint)), //positionId
                false //bool isLiquidity, trade
            );
        }
        stateChangerVar = 2 * 9;

        createTraderPositionShortPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
        stateChangerVar = 30 * 30;
    }

    function fuzz_modifyTraderPositionLong(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) public setCurrentActor {
        ModifyTraderPositionParams
            memory params = modifyTraderPositionLongPreconditions(
                collateralAmountSeed,
                tokenAmountSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        (bool success, bytes memory returnData) = _modifyTraderPositionCall(
            params.positionId,
            params.tokenAmount,
            params.collateralAmount,
            params.deadline
        );
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //true if pushed

        modifyTraderPositionLongPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_modifyTraderPositionShort(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) public setCurrentActor {
        ModifyTraderPositionParams
            memory params = modifyTraderPositionShortPreconditions(
                collateralAmountSeed,
                tokenAmountSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;
        uint a; //coverage checker for optimizer
        _before(actorsToUpdate);
        (bool success, bytes memory returnData) = _modifyTraderPositionCall(
            params.positionId,
            params.tokenAmount,
            params.collateralAmount,
            params.deadline
        );
        a = 1;
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //check if not pushed

        modifyTraderPositionShortPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
        a = 1 * 7;
    }

    function fuzz_closeTraderPosition(
        uint collateralAmountSeed
    ) public setCurrentActor {
        ModifyTraderPositionParams
            memory params = closeTraderPositionPreconditions(
                collateralAmountSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);
        (bool success, bytes memory returnData) = _modifyTraderPositionCall(
            params.positionId,
            params.tokenAmount,
            params.collateralAmount,
            params.deadline
        );
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //true if pushed

        closeTraderPositionPostConditions(success, returnData, actorsToUpdate);
    }
}
