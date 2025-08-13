// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import "../storage/Errors.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";

contract ConfigurationModule is IConfigurationModule, ReentrancyGuardUpgradeable {
    using MarketGroup for MarketGroup.Data;
    using Market for Market.Data;

    modifier onlyOwner() {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        if (marketGroup.owner == address(0)) {
            revert Errors.MarketNotInitialized();
        }
        if (msg.sender != marketGroup.owner) {
            revert Errors.OnlyOwner();
        }
        _;
    }

    /**
     * @notice Initialize a new market group
     * @param initialOwner The initial owner of the market group
     * @param collateralAsset The collateral asset for the market group. Notice: Fee on transfer is not supported for this asset.
     * @param minTradeSize The minimum trade size for the market group
     * @param bridgedSettlement Whether the market group uses bridged settlement
     * @param marketParams The initial market parameters
     */
    function initializeMarketGroup(
        address initialOwner,
        address collateralAsset,
        uint256 minTradeSize,
        bool bridgedSettlement,
        ISapienceStructs.MarketParams memory marketParams
    ) external override nonReentrant {
        MarketGroup.createValid(
            initialOwner, collateralAsset, minTradeSize, bridgedSettlement, marketParams
        );
        emit MarketGroupInitialized(
            initialOwner, collateralAsset, minTradeSize, bridgedSettlement, marketParams
        );
    }

    function updateMarketGroup(ISapienceStructs.MarketParams memory marketParams) external override onlyOwner {
        MarketGroup.updateValid(marketParams);

        emit MarketGroupUpdated(marketParams);
    }

    function createMarket(ISapienceStructs.MarketCreationParams memory params)
        external
        override
        nonReentrant
        onlyOwner
        returns (uint256 marketId)
    {
        // load the market to check if it's already created
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        uint256 newMarketId = marketGroup.getNewMarketId();

        Market.createValid(
            newMarketId,
            params.startTime,
            params.endTime,
            params.startingSqrtPriceX96,
            params.baseAssetMinPriceTick,
            params.baseAssetMaxPriceTick,
            params.salt,
            params.claimStatementYesOrNumeric,
            params.claimStatementNo
        );
        emit MarketCreated(
            newMarketId,
            params.startTime,
            params.endTime,
            params.startingSqrtPriceX96,
            params.claimStatementYesOrNumeric,
            params.claimStatementNo
        );

        return newMarketId;
    }

    function transferOwnership(address newOwner) external nonReentrant onlyOwner {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        address oldOwner = marketGroup.owner;
        marketGroup.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external nonReentrant {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        address oldOwner = marketGroup.owner;
        marketGroup.acceptOwnership();
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pendingOwner() external view returns (address) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        return marketGroup.pendingOwner;
    }

    function owner() external view returns (address) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        return marketGroup.owner;
    }
}
