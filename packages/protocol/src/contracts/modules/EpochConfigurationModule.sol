// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
// TODO Reentrancy guard should be refactored as router compatible (uses local storage)
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../storage/Epoch.sol";
import "../storage/FAccount.sol";
import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../storage/Market.sol";
import "forge-std/console2.sol";

contract EpochConfigurationModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using FAccount for FAccount.Data;
    using Position for Position.Data;
    using ERC721Storage for ERC721Storage.Data;
    using Market for Market.Data; // Use the Market library

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
        Market.EpochParams memory epochParams
    ) external {
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
        Market.EpochParams memory epochParms
    ) external onlyOwner {
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
        uint startTime,
        uint endTime,
        uint160 startingSqrtPriceX96
    ) external onlyOwner {
        Market.Data storage market = Market.loadValid();

        Epoch.createValid(startTime, endTime, startingSqrtPriceX96);
    }

    function getMarket()
        external
        view
        returns (
            address owner,
            address collateralAsset,
            address uniswapPositionManager,
            address uniswapQuoter,
            address uniswapSwapRouter,
            address optimisticOracleV3,
            Market.EpochParams memory epochParams
        )
    {
        Market.Data storage market = Market.load();
        return (
            market.owner,
            address(market.collateralAsset),
            address(market.uniswapPositionManager),
            address(market.uniswapQuoter),
            address(market.uniswapSwapRouter),
            address(market.optimisticOracleV3),
            market.epochParams
        );
    }

    function getEpoch()
        external
        view
        returns (
            uint startTime,
            uint endTime,
            address pool,
            address ethToken,
            address gasToken
        )
    {
        Epoch.Data storage epoch = Epoch.load();
        return (
            epoch.startTime,
            epoch.endTime,
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken)
        );
    }

    function getPositionData(
        uint256 accountId
    ) external pure returns (Position.Data memory) {
        return Position.load(accountId);
    }

    function getAccountData(
        uint256 accountId
    ) external pure returns (FAccount.Data memory) {
        return FAccount.load(accountId);
    }
}
