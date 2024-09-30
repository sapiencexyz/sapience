// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./helper/preconditions/PreconditionsEpochLiquidityModule.sol";
import "./helper/postconditions/PostconditionsEpochLiquidityModule.sol";
import "./util/FunctionCalls.sol";

contract FuzzEpochLiquidityModule is
    PreconditionsEpochLiquidityModule,
    PostconditionsEpochLiquidityModule
{
    function fuzz_createLiquidityPosition(
        uint collateralAmountSeed,
        int24 lowerTickSeed,
        int24 upperTickSeed
    ) public setCurrentActor {
        IFoilStructs.LiquidityMintParams
            memory params = createLiquidityPositionPreconditions(
                collateralAmountSeed,
                lowerTickSeed,
                upperTickSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);

        weth.approve(address(foil), type(uint256).max);
        (bool success, bytes memory returnData) = _createLiquidityPositionCall(
            params
        );
        require(
            !checkIfTraderPushedPriceOutsideOfBoundaries(),
            "Price pushed out of boundaries upon creation"
        ); //check if not pushed

        (uint positionId, , , , , ) = abi.decode(
            returnData,
            (uint, uint, uint, uint128, uint, uint)
        );
        fl.log("addPosition after");

        if (success) {
            addPosition(params.epochId, currentActor, positionId, true);
        }
        fl.log("addPosition after");

        createLiquidityPositionPostconditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_increaseLiquidityPosition(
        uint collateralAmountSeed
    ) public setCurrentActor {
        weth.balanceOf(foil); //resetting prank
        IFoilStructs.LiquidityIncreaseParams
            memory params = increaseLiquidityPositionPreconditions(
                collateralAmountSeed
            );

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);
        (
            bool success,
            bytes memory returnData
        ) = _increaseLiquidityPositionCall(params);
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //check if not pushed

        increaseLiquidityPositionPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_decreaseLiquidityPosition(uint seed) public setCurrentActor {
        IFoilStructs.LiquidityDecreaseParams
            memory params = decreaseLiquidityPositionPreconditions(seed);

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;
        uint stateChangerVar = 30 * 30; //@audit fuzzing cov trick to cover function with optimizer
        _before(actorsToUpdate);
        (
            bool success,
            bytes memory returnData
        ) = _decreaseLiquidityPositionCall(params);
        stateChangerVar = 30 * 38;
        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //check if not pushed
        stateChangerVar = 30 * 48;

        if (success) {
            if (isPositionTypeTrade(params.positionId)) {
                deletePosition(
                    getLatestEpoch(),
                    currentActor,
                    params.positionId,
                    true //isLiquidity
                );
                addPosition(
                    getLatestEpoch(),
                    currentActor,
                    params.positionId,
                    false //isLiquidity, its a trade position
                );
            }
        }

        decreaseLiquidityPositionPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
        stateChangerVar = 4 * 38;
    }

    function fuzz_closeLiquidityPosition(uint seed) public setCurrentActor {
        IFoilStructs.LiquidityDecreaseParams
            memory params = closeLiquidityPositionPreconditions(seed); //close is a branch in decrease

        address[] memory actorsToUpdate = new address[](1);
        actorsToUpdate[0] = currentActor;

        _before(actorsToUpdate);
        (
            bool success,
            bytes memory returnData
        ) = _decreaseLiquidityPositionCall(params);

        if (success) {
            if (isPositionTypeTrade(params.positionId)) {
                deletePosition(
                    getLatestEpoch(),
                    currentActor,
                    params.positionId,
                    true //isLiquidity
                );
                addPosition(
                    getLatestEpoch(),
                    currentActor,
                    params.positionId,
                    false //isLiquidity, its a trade position
                );
            }
        }

        require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //check if not pushed

        closeLiquidityPositionPostConditions(
            success,
            returnData,
            actorsToUpdate
        );
    }

    function fuzz_closeAllLiquidityPositions() public {
        (bool success, bytes memory returnData) = _getLatestEpochCall();
        if (success) {
            //epoch should be created
            (uint epochId, , , , , , , , , , ) = abi.decode(
                returnData,
                (
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    uint256,
                    uint256,
                    bool,
                    uint256,
                    IFoilStructs.EpochParams
                )
            );

            (uint[] memory liquidityPositions, ) = getAllPositionsIdsOfAllUsers(
                epochId
            );

            IFoilStructs.LiquidityDecreaseParams[]
                memory paramsArray = closeAllLiquidityPositionsPreconditions(
                    liquidityPositions
                );

            for (uint i = 0; i < paramsArray.length; i++) {
                IFoilStructs.LiquidityDecreaseParams
                    memory params = paramsArray[i];

                (success, returnData) = _getPositionOwnerCall(
                    params.positionId
                );
                assert(success);
                address positionOwner = abi.decode(returnData, (address));
                vm.prank(positionOwner);
                (success, returnData) = _decreaseLiquidityPositionCallNOPRANK(
                    params
                );
                if (success) {
                    if (isPositionTypeTrade(params.positionId)) {
                        console.log(
                            "fuzz_closeAllLiquidityPositions::This position number was converted to trade position",
                            params.positionId
                        );
                        deletePosition(
                            getLatestEpoch(),
                            positionOwner,
                            params.positionId,
                            true //isLiquidity
                        );
                        addPosition(
                            getLatestEpoch(),
                            positionOwner,
                            params.positionId,
                            false //isLiquidity, its a trade position
                        );
                    }
                }
                // fl.t(success, SETTLE_01);
                require(!checkIfTraderPushedPriceOutsideOfBoundaries()); //check if not pushed
            }
            closeAllLiquidityPositionsPostConditions(success, returnData);
        }
    }
}
