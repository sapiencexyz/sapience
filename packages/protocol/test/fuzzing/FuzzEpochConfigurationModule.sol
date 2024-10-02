// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helper/preconditions/PreconditionsEpochConfigurationModule.sol";
import "./helper/postconditions/PostconditionsEpochConfigurationModule.sol";
import "./util/FunctionCalls.sol";

contract FuzzEpochConfigurationModule is
    PreconditionsEpochConfigurationModule,
    PostconditionsEpochConfigurationModule
{
    function fuzz_initializeMarket(
        int24 minTick,
        int24 maxTick
    ) public setCurrentActor {
        //setCurrentActor use vm.prank(actor)
        InitializeMarketParams memory params = initializeMarketPreconditions(
            minTick,
            maxTick
        );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        vm.prank(currentActor);
        (bool success, bytes memory returnData) = _initializeMarketCall(
            params.owner,
            params.collateralAsset, //NOTE: remediated contracts, require less params
            params.epochParams,
            address(foil)
        );

        InitializeMarketPostConditions(success, returnData, actorsToUpdate);
    }

    function fuzz_updateMarket(
        int24 minTick,
        int24 maxTick
    ) public setCurrentActor {
        //reusing initialization params randomizer since we updating only min and max ticks
        InitializeMarketParams memory params = initializeMarketPreconditions(
            minTick,
            maxTick
        );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        vm.prank(currentActor);
        (bool success, bytes memory returnData) = _updateMarketCall(
            params.epochParams //NOTE: remediated contracts, require less params
        );

        updateMarketPostConditions(success, returnData, actorsToUpdate);
    }

    function fuzz_createEpoch(
        uint160 startingSqrtPriceX96Seed
    ) public setCurrentActor {
        CreateEpochParams memory params = createEpochPreconditions(
            startingSqrtPriceX96Seed
        );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        vm.prank(currentActor);
        (bool success, bytes memory returnData) = _createEpochCall(
            params.startTime,
            params.endTime,
            params.startingSqrtPriceX96,
            uint256(1) //salt, any
        );

        createEpochPostConditions(success, returnData, actorsToUpdate);
    }
}
