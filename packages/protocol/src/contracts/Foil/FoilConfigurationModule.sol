// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../storage/Epoch.sol";
import "../../storage/Account.sol";
import "../../storage/Position.sol";
import "../../storage/ERC721Storage.sol";
import "forge-std/console2.sol";

contract FoilConfigurationModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;

    constructor(
        uint startTime,
        uint endTime,
        address uniswapPositionManager,
        address uniswapQuoter,
        address collateralAsset,
        int24 baseAssetMinPrice,
        int24 baseAssetMaxPrice,
        uint24 feeRate,
        address optimisticOracleV3
    ) {
        Epoch.Data storage epoch = Epoch.createValid(
            startTime,
            endTime,
            uniswapPositionManager,
            uniswapQuoter,
            collateralAsset,
            baseAssetMinPrice,
            baseAssetMaxPrice,
            feeRate,
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
        uint accountId = ERC721Storage.load().totalSupply() + 1;
        Account.createValid(accountId);
        ERC721Storage.load()._mint(msg.sender, accountId);

        // Create empty position
        Position.load(accountId).accountId = accountId;
    }
}
