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
import "forge-std/console2.sol";

contract EpochConfigurationModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using FAccount for FAccount.Data;
    using Position for Position.Data;
    using ERC721Storage for ERC721Storage.Data;

    function createEpoch(
        uint startTime,
        uint endTime,
        address uniswapPositionManager,
        address uniswapQuoter,
        address uniswapSwapRouter,
        address collateralAsset,
        int24 baseAssetMinPrice,
        int24 baseAssetMaxPrice,
        uint24 feeRate,
        uint160 startingSqrtPriceX96,
        address optimisticOracleV3
    ) external {
        Epoch.createValid(
            startTime,
            endTime,
            uniswapPositionManager,
            uniswapQuoter,
            uniswapSwapRouter,
            collateralAsset,
            baseAssetMinPrice,
            baseAssetMaxPrice,
            feeRate,
            startingSqrtPriceX96,
            optimisticOracleV3
        );
    }

    function getMarket()
        external
        view
        returns (
            uint startTime,
            uint endTime,
            address uniswapPositionManager,
            address collateralAsset,
            int24 baseAssetMinPriceTick,
            int24 baseAssetMaxPriceTick,
            uint24 feeRate,
            address ethToken,
            address gasToken,
            address pool
        )
    {
        Epoch.Data storage epoch = Epoch.load();
        return (
            epoch.startTime,
            epoch.endTime,
            address(epoch.uniswapPositionManager),
            address(epoch.collateralAsset),
            epoch.baseAssetMinPriceTick,
            epoch.baseAssetMaxPriceTick,
            epoch.feeRate,
            address(epoch.ethToken),
            address(epoch.gasToken),
            address(epoch.pool)
        );
    }

    function getEpoch()
        external
        view
        returns (address pool, address ethToken, address gasToken)
    {
        Epoch.Data storage epoch = Epoch.load();
        return (
            address(epoch.pool),
            address(epoch.ethToken),
            address(epoch.gasToken)
        );
    }

    function createTraderPosition() external {
        uint accountId = ERC721EnumerableStorage.totalSupply() + 1;
        FAccount.createValid(accountId);
        ERC721Storage._mint(msg.sender, accountId);
        // Create empty position
        Position.load(accountId).accountId = accountId;
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
