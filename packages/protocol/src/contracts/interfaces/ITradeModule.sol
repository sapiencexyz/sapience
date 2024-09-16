// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface ITradeModule {
    event TraderPositionCreated(
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice
    );

    event TraderPositionModified(
        uint256 indexed epochId,
        uint256 indexed positionId,
        uint256 collateralAmount,
        uint256 vEthAmount,
        uint256 vGasAmount,
        uint256 borrowedVEth,
        uint256 borrowedVGas,
        uint256 initialPrice,
        uint256 finalPrice
    );

    function createTraderPosition(
        uint256 epochId,
        int256 size,
        uint256 maxCollateral,
        uint256 deadline
    ) external returns (uint256 positionId);

    function modifyTraderPosition(
        uint256 positionId,
        int256 size,
        uint256 maxCollateral,
        uint256 deadline
    ) external;

    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external returns (uint256 requiredCollateral);

    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    ) external returns (uint256 requiredCollateral);
}
