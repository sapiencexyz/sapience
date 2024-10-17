// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IFoilStructs} from "./IFoilStructs.sol";

interface IConfigurationModule {
    event MarketInitialized(
        address initialOwner,
        address collateralAsset,
        address feeCollectorNFT,
        IFoilStructs.EpochParams epochParams
    );

    event MarketUpdated(IFoilStructs.EpochParams epochParams);

    event EpochCreated(
        uint epochId,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    );

    event OwnershipTransferStarted(
        address indexed previousOwner,
        address indexed newOwner
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /**
     * @notice Initializes a market
     * @param owner Address of a market owner, which can update the configurations and submit a settlement price
     * @param collateralAsset Address of the collateral used by the market. This cannot be a rebase token.
     * @param epochParams Parameters used when new epochs are created
     */
    function initializeMarket(
        address owner,
        address collateralAsset,
        address[] calldata feeCollectors,
        IFoilStructs.EpochParams memory epochParams
    ) external;

    function updateMarket(IFoilStructs.EpochParams memory epochParams) external;

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        uint256 salt
    ) external;
}
