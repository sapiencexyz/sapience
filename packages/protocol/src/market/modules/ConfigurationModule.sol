// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";
import "../storage/Errors.sol";

contract ConfigurationModule is
    IConfigurationModule,
    ReentrancyGuardUpgradeable
{
    using Market for Market.Data;

    address immutable marketInitializer;

    constructor(address _marketInitializer) {
        marketInitializer = _marketInitializer;
    }

    modifier onlyOwner() {
        Market.Data storage market = Market.load();
        if (msg.sender != market.owner) {
            revert Errors.OnlyOwner();
        }
        if (market.owner == address(0)) {
            revert Errors.MarketNotInitialized();
        }
        _;
    }

    function initializeMarket(
        address initialOwner,
        address collateralAsset,
        IFoilStructs.EpochParams memory epochParams
    ) external override nonReentrant {
        if (msg.sender != marketInitializer) {
            revert Errors.OnlyInitializer(msg.sender, marketInitializer);
        }
        Market.createValid(initialOwner, collateralAsset, epochParams);
        emit MarketInitialized(initialOwner, collateralAsset, epochParams);
    }

    function updateMarket(
        IFoilStructs.EpochParams memory epochParams
    ) external override onlyOwner {
        Market.updateValid(epochParams);

        emit MarketUpdated(epochParams);
    }

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        uint256 salt
    ) external override nonReentrant onlyOwner returns (uint256 epochId) {
        // load the market to check if it's already created
        Market.Data storage market = Market.load();

        uint256 newEpochId = market.getNewEpochId();

        Epoch.createValid(
            newEpochId,
            startTime,
            endTime,
            startingSqrtPriceX96,
            salt
        );
        emit EpochCreated(newEpochId, startTime, endTime, startingSqrtPriceX96);

        return newEpochId;
    }

    function transferOwnership(
        address newOwner
    ) external nonReentrant onlyOwner {
        Market.Data storage market = Market.load();
        address oldOwner = market.owner;
        market.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external nonReentrant {
        Market.Data storage market = Market.load();
        address oldOwner = market.owner;
        market.acceptOwnership();
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pendingOwner() external view returns (address) {
        Market.Data storage market = Market.load();
        return market.pendingOwner;
    }

    function owner() external view returns (address) {
        Market.Data storage market = Market.load();
        return market.owner;
    }
}
