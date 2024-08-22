// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// TODO Reentrancy guard should be refactored as router compatible (uses local storage)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IEpochConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/Epoch.sol";

// import "forge-std/console2.sol";

contract EpochConfigurationModule is
    IEpochConfigurationModule,
    ReentrancyGuard
{
    using Market for Market.Data;

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
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external override {
        Market.createValid(
            owner,
            collateralAsset,
            uniswapPositionManager,
            uniswapSwapRouter,
            optimisticOracleV3,
            epochParams
        );
    }

    function updateMarket(
        address owner,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParms
    ) external override onlyOwner {
        Market.updateValid(
            owner, // should be nominate/accept
            uniswapPositionManager,
            uniswapSwapRouter,
            optimisticOracleV3,
            epochParms
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
    }
}
