// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// TODO Reentrancy guard should be refactored as router compatible (uses local storage)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";

// import "forge-std/console2.sol";

contract ConfigurationModule is IConfigurationModule, ReentrancyGuard {
    using Market for Market.Data;

    address immutable initializer;

    constructor() {
        initializer = msg.sender;
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
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address uniswapQuoter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external override {
        require(msg.sender == initializer, "Only initializer can call this function");
        Market.createValid(
            owner,
            collateralAsset,
            uniswapPositionManager,
            uniswapSwapRouter,
            uniswapQuoter,
            optimisticOracleV3,
            epochParams
        );
        emit MarketInitialized(
            owner,
            collateralAsset,
            uniswapPositionManager,
            uniswapSwapRouter,
            uniswapQuoter,
            optimisticOracleV3,
            epochParams
        );
    }

    function updateMarket(
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address uniswapQuoter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external override onlyOwner {
        Market.updateValid(
            uniswapPositionManager,
            uniswapSwapRouter,
            uniswapQuoter,
            optimisticOracleV3,
            epochParams
        );

        emit MarketUpdated(
            uniswapPositionManager,
            uniswapSwapRouter,
            uniswapQuoter,
            optimisticOracleV3,
            epochParams
        );
    }

    function createEpoch(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    ) external override onlyOwner {
        // load the market to check if it's already created
        Market.Data storage market = Market.loadValid();

        uint256 newEpochId = market.getNewEpochId();

        Epoch.createValid(newEpochId, startTime, endTime, startingSqrtPriceX96);
        emit EpochCreated(newEpochId, startTime, endTime, startingSqrtPriceX96);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        Market.Data storage market = Market.loadValid();
        address oldOwner = market.owner;
        market.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external {
        Market.Data storage market = Market.loadValid();
        address oldOwner = market.owner;
        market.acceptOwnership();
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pendingOwner() external view returns (address) {
        Market.Data storage market = Market.loadValid();
        return market.pendingOwner();
    }

    function owner() external view returns (address) {
        Market.Data storage market = Market.loadValid();
        return market.owner;
    }
}
