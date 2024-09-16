// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// TODO Reentrancy guard should be refactored as router compatible (uses local storage)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";
import "../storage/Errors.sol";

contract ConfigurationModule is IConfigurationModule, ReentrancyGuard {
    using Market for Market.Data;

    address immutable initializer;

    constructor(address _initializer) {
        initializer = _initializer;
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
    ) external override {
        if (msg.sender != initializer) {
            revert Errors.OnlyInitializer(msg.sender, initializer);
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
    ) external override onlyOwner {
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
    }

    function transferOwnership(address newOwner) external onlyOwner {
        Market.Data storage market = Market.load();
        address oldOwner = market.owner;
        market.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external {
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
