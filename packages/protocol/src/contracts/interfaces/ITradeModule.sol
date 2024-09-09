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

    /**
     * @notice Create a new position for a trade
     * @param epochId the epoch id
     * @param collateralAmount amount of collateral to deposit for the position
     * @param tokenAmount size of the position as vgas token amount. Positive for long, negative for short
     * @param tokenAmountLimit token amount limit for slippage protection, 0 for no limit
     * @return positionId the id of the created position
     */
    function createTraderPosition(
        uint256 epochId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external returns (uint256 positionId);

    /**
     * @notice Modify an existing trade position
     * @param positionId id of the position to modify
     * @param collateralAmount new amount of collateral to deposit for the position (not delta), if less than current will withdraw
     * @param tokenAmount new size of the position as vgas token amount. Positive for long, negative for short
     * @param tokenAmountLimit token amount limit for slippage protection, 0 for no limit
     */
    function modifyTraderPosition(
        uint256 positionId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    ) external;

    function createTraderPosition(
        uint256 epochId,
        int256 size,
        uint256 collateralDeltaLimit
    ) external returns (uint256 positionId);

    function modifyTraderPosition(
        uint256 positionId,
        int256 size,
        uint256 collateralDeltaLimit
    ) external;

    function quoteCreateTraderPosition(
        uint256 epochId,
        int256 size
    ) external view returns (int256 collateralDelta);

    function quoteModifyTraderPosition(
        uint256 positionId,
        int256 size
    ) external  view returns (int256 collateralDelta);
}
