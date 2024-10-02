// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PreconditionsBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract PreconditionsEpochLiquidityModule is PreconditionsBase {
    //IFoilStructs
    //   struct LiquidityMintParams {
    //     uint256 epochId;
    //     uint256 amountTokenA;
    //     uint256 amountTokenB;
    //     uint256 collateralAmount;
    //     int24 lowerTick;
    //     int24 upperTick;
    //     uint256 minAmountTokenA;
    //     uint256 minAmountTokenB;
    //      uint256 deadline; //added in remediations
    // }
    function createLiquidityPositionPreconditions(
        uint collateralAmountSeed,
        int24 lowerTickSeed,
        int24 upperTickSeed
    ) internal returns (IFoilStructs.LiquidityMintParams memory params) {
        params.epochId = getLatestEpoch();

        params.collateralAmount = fl.clamp(
            collateralAmountSeed,
            1,
            weth.balanceOf(currentActor) / 30
        ); //get some part of balance

        (bool success, bytes memory returnData) = _getCurrentEpochTicksCall(
            params.epochId
        );
        (int24 minEpochTick, int24 maxEpochTick) = abi.decode(
            returnData,
            (int24, int24)
        );

        params.lowerTick = roundUpToNearestValidTick(
            clampInt24(
                lowerTickSeed,
                minEpochTick,
                maxEpochTick,
                true //enable logs
            ),
            200 //tick spacing for 1% fee uni pool
        );
        params.upperTick = roundUpToNearestValidTick(
            clampInt24(upperTickSeed, minEpochTick, maxEpochTick, true),
            200
        );

        if (params.lowerTick > params.upperTick) {
            int24 temp = params.lowerTick;
            params.lowerTick = params.upperTick;
            params.upperTick = temp;
        }

        (
            params.amountTokenA,
            params.amountTokenB,

        ) = getTokenAmountsForCollateralAmount(
            params.collateralAmount,
            params.lowerTick,
            params.upperTick
        );
        params.collateralAmount = params.collateralAmount + 1e8; //+ dust
        params.minAmountTokenA = 0;
        params.minAmountTokenB = 0;
        params.deadline = collateralAmountSeed;
    }

    //  struct LiquidityDecreaseParams {
    //     uint256 positionId;
    //     uint128 liquidity;
    //     uint256 minGasAmount;
    //     uint256 minEthAmount;
    //      uint256 deadline; //added in remediations

    // }

    function decreaseLiquidityPositionPreconditions(
        uint seed
    ) internal returns (IFoilStructs.LiquidityDecreaseParams memory params) {
        params.positionId = getRandomPositionId(currentActor, seed, true);

        (bool success, bytes memory returnData) = _getPositionLiquidityCall(
            params.positionId
        );
        (, , , , params.liquidity) = abi.decode(
            returnData,
            (uint256, uint256, int24, int24, uint128)
        );
        uint liquidity = fl.clamp(seed, 1, uint(params.liquidity * 2), true); // x2 to check if possible to withdraw more

        params.liquidity = uint128(liquidity);
        params.minGasAmount = 0;
        params.minEthAmount = 0;
        params.deadline = seed;
    }

    //         struct LiquidityIncreaseParams {
    //         uint256 positionId;
    //         uint256 collateralAmount;
    //         uint256 gasTokenAmount;
    //         uint256 ethTokenAmount;
    //         uint256 minGasAmount;
    //         uint256 minEthAmount;
    //      uint256 deadline; //added in remediations

    //     }

    function increaseLiquidityPositionPreconditions(
        uint collateralAmountSeed
    ) internal returns (IFoilStructs.LiquidityIncreaseParams memory params) {
        params.positionId = getRandomPositionId(
            currentActor,
            collateralAmountSeed,
            true
        );

        params.collateralAmount = fl.clamp(
            collateralAmountSeed,
            0,
            weth.balanceOf(currentActor) / 30
        ); //get some part of balance
        (bool success, bytes memory returnData) = _getPositionLiquidityCall(
            params.positionId
        );
        (, , int24 lowerTick, int24 upperTick, ) = abi.decode(
            returnData,
            (uint256, uint256, int24, int24, uint128)
        );
        (
            params.gasTokenAmount,
            params.ethTokenAmount,

        ) = getTokenAmountsForCollateralAmount(
            params.collateralAmount,
            lowerTick,
            upperTick
        );
        //NOTE: always add dust AFTER Token Amounts For Collateral, usually off by 5-50 wei and InsufficientCollateral error pops
        params.collateralAmount = params.collateralAmount + 1e8; //+ dust

        params.minGasAmount = 0;
        params.minEthAmount = 0;
        params.deadline = collateralAmountSeed;
    }

    function closeLiquidityPositionPreconditions(
        uint seed
    ) internal returns (IFoilStructs.LiquidityDecreaseParams memory params) {
        params.positionId = getRandomPositionId(currentActor, seed, true);

        (bool success, bytes memory returnData) = _getPositionLiquidityCall(
            params.positionId
        );
        (, , , , params.liquidity) = abi.decode(
            returnData,
            (uint256, uint256, int24, int24, uint128)
        );

        params.minGasAmount = 0;
        params.minEthAmount = 0;
        params.deadline = seed;
    }

    function closeAllLiquidityPositionsPreconditions(
        uint[] memory positionIds
    ) internal returns (IFoilStructs.LiquidityDecreaseParams[] memory) {
        IFoilStructs.LiquidityDecreaseParams[]
            memory paramsArray = new IFoilStructs.LiquidityDecreaseParams[](0);

        for (uint i = 0; i < positionIds.length; i++) {
            (bool success, bytes memory returnData) = _getPositionLiquidityCall(
                positionIds[i]
            );

            if (!success) {
                continue;
            }

            IFoilStructs.LiquidityDecreaseParams memory params;
            params.positionId = positionIds[i];

            (, , , , params.liquidity) = abi.decode(
                returnData,
                (uint256, uint256, int24, int24, uint128)
            );

            params.minGasAmount = 0;
            params.minEthAmount = 0;
            params.deadline = type(uint256).max;

            IFoilStructs.LiquidityDecreaseParams[]
                memory newParamsArray = new IFoilStructs.LiquidityDecreaseParams[](
                    paramsArray.length + 1
                );
            for (uint j = 0; j < paramsArray.length; j++) {
                newParamsArray[j] = paramsArray[j];
            }
            newParamsArray[paramsArray.length] = params;
            paramsArray = newParamsArray;
        }

        return paramsArray;
    }
}
