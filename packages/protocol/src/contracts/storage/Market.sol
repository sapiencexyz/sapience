// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/ISwapRouter.sol";
import "./Errors.sol";
import "../interfaces/IFoilStructs.sol";

library Market {
    struct Data {
        address owner;
        IERC20 collateralAsset;
        INonfungiblePositionManager uniswapPositionManager;
        ISwapRouter uniswapSwapRouter;
        OptimisticOracleV3Interface optimisticOracleV3;
        IFoilStructs.EpochParams epochParams;
        uint256 lastEpochId; // index of the last epoch
        mapping(bytes32 => uint256) epochIdByAssertionId;
    }

    function load() internal pure returns (Data storage market) {
        bytes32 slot = keccak256("foil.gas.market");

        assembly {
            market.slot := slot
        }
    }

    function createValid(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        market = load();

        // can only be called once
        if (address(market.uniswapPositionManager) != address(0)) {
            revert Errors.MarketAlreadyCreated();
        }

        market.owner = owner;
        market.collateralAsset = IERC20(collateralAsset);
        market.uniswapPositionManager = INonfungiblePositionManager(
            uniswapPositionManager
        );
        market.uniswapSwapRouter = ISwapRouter(uniswapSwapRouter);
        market.optimisticOracleV3 = OptimisticOracleV3Interface(
            optimisticOracleV3
        );
        market.epochParams = epochParams;
    }

    function updateValid(
        address owner,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        market = load();

        market.owner = owner;
        market.uniswapPositionManager = INonfungiblePositionManager(
            uniswapPositionManager
        );
        market.uniswapSwapRouter = ISwapRouter(uniswapSwapRouter);
        market.optimisticOracleV3 = OptimisticOracleV3Interface(
            optimisticOracleV3
        );
        market.epochParams = epochParams;
    }

    function loadValid() internal view returns (Data storage market) {
        market = load();

        if (address(market.uniswapPositionManager) == address(0)) {
            revert Errors.InvalidMarket();
        }
    }

    function getNewEpochId(Data storage self) internal returns (uint256) {
        self.lastEpochId++;
        return self.lastEpochId;
    }
}
