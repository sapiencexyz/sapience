// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ISapienceStructs} from "./ISapienceStructs.sol";

interface IConfigurationModule {
    event MarketInitialized(
        address initialOwner,
        address collateralAsset,
        address feeCollectorNFT,
        uint256 minTradeSize,
        ISapienceStructs.MarketParams marketParams
    );

    event MarketUpdated(ISapienceStructs.MarketParams marketParams);

    event MarketCreated(
        uint marketId,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        bytes claimStatement
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
     * @notice Initializes a market group
     * @param owner Address of a market group owner, which can update the configurations and submit a settlement price
     * @param collateralAsset Address of the collateral used by the market group. This cannot be a rebase token.
     * @param feeCollectors Addresses of fee collectors
     * @param minTradeSize Minimum trade size for a position
     * @param marketParams Parameters used when new markets are created
     */
    function initializeMarketGroup(
        address owner,
        address collateralAsset,
        address[] calldata feeCollectors,
        uint256 minTradeSize,
        ISapienceStructs.MarketParams memory marketParams
    ) external;

    function updateMarketGroup(
        ISapienceStructs.MarketParams memory marketParams
    ) external;

    function createMarket(
        ISapienceStructs.MarketCreationParams memory params
    ) external returns (uint256 marketId);
}
