// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

// TODO Reentrancy guard should be refactored as router compatible (uses local storage)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../storage/Epochs.sol";
import "../interfaces/IEpochConfigurationModule.sol";

// import "forge-std/console2.sol";

contract EpochConfigurationModule is
    IEpochConfigurationModule,
    ReentrancyGuard
{
    modifier onlyOwner() {
        Market.Data storage market = Market.load();
        require(msg.sender == market.owner, "Caller is not the owner");
        _;
    }

    function initializeMarket(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapQuoter,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) external override {
        Market.createValid(
            owner,
            collateralAsset,
            uniswapPositionManager,
            uniswapQuoter,
            uniswapSwapRouter,
            optimisticOracleV3,
            epochParams
        );
    }

    function updateMarket(
        address owner,
        address uniswapPositionManager,
        address uniswapQuoter,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParms
    ) external override onlyOwner {
        Market.updateValid(
            owner, // should be nominate/accept
            uniswapPositionManager,
            uniswapQuoter,
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
        Market.loadValid();

        Epoch.Data storage epoch = Epoch.createValid(
            startTime,
            endTime,
            startingSqrtPriceX96
        );
        Epochs.addEpoch(epoch);
    }
}
