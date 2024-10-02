// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helper/preconditions/PreconditionsEpochUMASettlementModule.sol";
import "./helper/postconditions/PostconditionsEpochUMASettlementModule.sol";
import "./util/FunctionCalls.sol";

contract FuzzEpochUMASettlementModule is
    PreconditionsEpochUMASettlementModule,
    PostconditionsEpochUMASettlementModule
{
    function fuzz_submitSettlementPrice(uint settlementPriceD18Seed) public {
        SubmitSettlementPriceParams
            memory params = submitSettlementPricePreconditions(
                settlementPriceD18Seed
            );

        (bool success, bytes memory returnData) = _getMarketOwnerCall();
        address owner = abi.decode(returnData, (address));

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = owner; //NOTE: owner is one of the users

        _before(actorsToUpdate);

        vm.warp(block.timestamp + 30 days + 1);
        vm.prank(owner);

        (success, returnData) = _submitSettlementPriceCall(
            params.epochId,
            params.settlementPriceD18
        );
        require(success);

        userAssertions[params.epochId].push(abi.decode(returnData, (bytes32)));

        submitSettlementPricePostConditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_mockDisputeAssertion(uint seed) public setCurrentActor {
        MockDisputeAssertionParams
            memory params = mockDisputeAssertionPreconditions(seed);

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        (bool success, bytes memory returnData) = _mockDisputeAssertionCall(
            params.assertionId,
            params.disputer
        );

        //NOTE: not deleting disputed assertion in epoch

        mockDisputeAssertionPostConditions(success, returnData, actorsToUpdate);
    }

    function fuzz_mockSettleAssertion(
        uint seed,
        bool settleAll
    ) public setCurrentActor {
        MockSettleAssertionParams
            memory params = mockSettleAssertionPreconditions(seed);

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        (bool success, bytes memory returnData) = _mockSettleAssertionCall(
            params.assertionId,
            params.settlementResolution
        );

        if (success == true && settleAll == true) {
            fl.log("fuzz_mockSettleAssertion::Going to settle all positions");
            settleAllPositions();
        }

        mockSettleAssertionPostConditions(success, returnData, actorsToUpdate);
    }
}
