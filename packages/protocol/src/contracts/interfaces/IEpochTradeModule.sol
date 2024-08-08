// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IEpochTradeModule {
    function createTraderPosition(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external returns (uint256 positionId);

    function modifyTraderPosition(
        uint256 positionId,
        uint256 depositedCollateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external;

    function getReferencePrice(
        uint256 epochId
    ) external view returns (uint256 price18Digits);
}
