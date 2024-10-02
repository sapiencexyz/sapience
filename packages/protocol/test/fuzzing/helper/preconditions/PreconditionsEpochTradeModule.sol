// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PreconditionsBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract PreconditionsEpochTradeModule is PreconditionsBase {
    struct CreateTraderPositionParams {
        uint256 epochId;
        uint256 collateralAmount;
        int256 tokenAmount;
        int256 tokenAmountLimit;
        uint256 deadline;
    }
    struct ModifyTraderPositionParams {
        uint256 positionId;
        int256 collateralAmount; //now is int
        int256 tokenAmount;
        int256 tokenAmountLimit;
        uint256 deadline;
    }
    function createTraderPositionLongPreconditions(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) internal returns (CreateTraderPositionParams memory params) {
        params.epochId = getLatestEpoch();
        params.tokenAmount = int(tokenAmountSeed);

        (
            bool success,
            bytes memory returnData
        ) = _quoteCreateTraderPositionCall(params.epochId, params.tokenAmount);

        params.collateralAmount = abi.decode(returnData, (uint256)); //getting exact collateral needed

        if (collateralAmountSeed % 2 == 0) {
            require(
                weth.balanceOf(currentActor) / 30 > params.collateralAmount,
                "modifyTraderPositionLongPreconditions::too much collateral was required"
            );
            //unchanged, faster coverage
        } else {
            /*
             * if collateral needed is < 1/30 of the balance, do not change the value,
             * if more than balance, clamp collateral for a smaller value
             * to create invalid input
             */
            params.collateralAmount = fl.clamp(
                params.collateralAmount,
                1,
                weth.balanceOf(currentActor) / 30
            );
        }
        params.tokenAmountLimit = 0;
        params.deadline = type(uint256).max;
    }

    function createTraderPositionShortPreconditions(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) internal returns (CreateTraderPositionParams memory params) {
        params.epochId = getLatestEpoch();
        params.tokenAmount = int(tokenAmountSeed + 1) * int(-1); //negative num will trigger _quoteCreateShortPosition

        (
            bool success,
            bytes memory returnData
        ) = _quoteCreateTraderPositionCall(params.epochId, params.tokenAmount);

        params.collateralAmount = abi.decode(returnData, (uint256)); //getting exact collateral needed

        if (collateralAmountSeed % 2 == 0) {
            require(
                weth.balanceOf(currentActor) / 30 > params.collateralAmount,
                "modifyTraderPositionLongPreconditions::too much collateral was required"
            );
            //unchanged, faster coverage
        } else {
            /*
             * if collateral needed is < 1/30 of the balance, do not change the value,
             * if more than balance, clamp collateral for a smaller value
             * to create invalid input
             */
            params.collateralAmount = fl.clamp(
                params.collateralAmount,
                1,
                weth.balanceOf(currentActor) / 30
            );
        }

        params.tokenAmountLimit = 0;
        params.deadline = type(uint256).max;
    }

    function modifyTraderPositionLongPreconditions(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) internal returns (ModifyTraderPositionParams memory params) {
        params.positionId = getRandomPositionId(
            currentActor,
            collateralAmountSeed,
            false
        );

        params.tokenAmount = int(tokenAmountSeed);

        (
            bool success,
            bytes memory returnData
        ) = _quoteModifyTraderPositionCall(
                params.positionId,
                params.tokenAmount
            );

        uint tempCollateralAmount = abi.decode(returnData, (uint256)); //getting exact collateral needed

        if (collateralAmountSeed % 3 == 0) {
            require(
                weth.balanceOf(currentActor) / 30 > tempCollateralAmount,
                "modifyTraderPositionLongPreconditions::too much collateral was required"
            );
            params.collateralAmount = int(tempCollateralAmount); //unchanged, faster coverage
        } else if (collateralAmountSeed % 3 == 1) {
            /*
             * if collateral needed is < 1/30 of the balance, do not change the value,
             * if more than balance, clamp collateral for a smaller value
             * to create invalid input
             */
            tempCollateralAmount = fl.clamp(
                tempCollateralAmount,
                1,
                weth.balanceOf(currentActor) / 30
            );
            params.collateralAmount = int(tempCollateralAmount);
        } else if (collateralAmountSeed % 3 == 2) {
            params.collateralAmount = int(collateralAmountSeed) % 2 == 0
                ? int(collateralAmountSeed)
                : -int(collateralAmountSeed);
        }

        params.tokenAmountLimit = 0;
        params.deadline = type(uint256).max;
    }

    function modifyTraderPositionShortPreconditions(
        uint collateralAmountSeed,
        uint tokenAmountSeed
    ) internal returns (ModifyTraderPositionParams memory params) {
        params.positionId = getRandomPositionId(
            currentActor,
            collateralAmountSeed,
            false
        );
        params.tokenAmount = int(tokenAmountSeed + 1) * int(-1); //filtering zeroes
        fl.log("params.tokenAmoun", params.tokenAmount);

        require(
            params.tokenAmount < 0,
            "modifyTraderPositionShortPreconditions::tokenAmount is positive"
        );
        uint a; //coverage checker for optimizer
        (
            bool success,
            bytes memory returnData
        ) = _quoteModifyTraderPositionCall(
                params.positionId,
                params.tokenAmount
            );

        uint tempCollateralAmount = abi.decode(returnData, (uint256)); //getting exact collateral needed
        a = 1;
        if (collateralAmountSeed % 3 == 0) {
            require(
                weth.balanceOf(currentActor) / 30 > tempCollateralAmount,
                "modifyTraderPositionLongPreconditions::too much collateral was required"
            );
            //unchanged, faster coverage
        } else if (collateralAmountSeed % 3 == 1) {
            /*
             * if collateral needed is < 1/30 of the balance, do not change the value,
             * if more than balance, clamp collateral for a smaller value
             * to create invalid input
             */
            tempCollateralAmount = fl.clamp(
                tempCollateralAmount,
                1,
                weth.balanceOf(currentActor) / 30
            );
        } else if (collateralAmountSeed % 3 == 2) {
            params.collateralAmount = int(collateralAmountSeed) % 2 == 0
                ? int(collateralAmountSeed)
                : -int(collateralAmountSeed);
        }
        a = 2;
        params.collateralAmount = int(tempCollateralAmount);
        params.tokenAmountLimit = 0;
        params.deadline = type(uint256).max;
        a = 3;
    }

    function closeTraderPositionPreconditions(
        uint collateralAmountSeed
    ) internal returns (ModifyTraderPositionParams memory params) {
        params.positionId = getRandomPositionId(
            currentActor,
            collateralAmountSeed,
            false
        );

        int256 clampedCollateralAmount = int256(
            fl.clamp(
                int256(collateralAmountSeed),
                1,
                int256(weth.balanceOf(currentActor) / 30)
            )
        );

        params.collateralAmount = 0; //TradeModule.sol::Closing the position. No need to check collateral limit
        params.tokenAmount = 0;
        params.tokenAmountLimit = 0;
        params.deadline = type(uint256).max;
    }
}
