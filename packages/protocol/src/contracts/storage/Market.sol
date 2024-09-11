// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/ISwapRouter.sol";
import "../interfaces/external/IUniswapV3Quoter.sol";
import "./Errors.sol";
import "../interfaces/IFoilStructs.sol";

library Market {
    using SafeERC20 for IERC20;

    struct Data {
        address owner;
        address pendingOwner;
        IERC20 collateralAsset;
        INonfungiblePositionManager uniswapPositionManager;
        ISwapRouter uniswapSwapRouter;
        IUniswapV3Quoter uniswapQuoter;
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
        address uniswapQuoter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        require(epochParams.assertionLiveness >= 6 hours, "assertionLiveness must be at least six hours");
        
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
        market.uniswapQuoter = IUniswapV3Quoter(uniswapQuoter);
        market.optimisticOracleV3 = OptimisticOracleV3Interface(
            optimisticOracleV3
        );
        market.epochParams = epochParams;
    }

    function updateValid(
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address uniswapQuoter,
        address optimisticOracleV3,
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        require(epochParams.assertionLiveness >= 6 hours, "assertionLiveness must be at least six hours");
        
        market = load();

        market.uniswapPositionManager = INonfungiblePositionManager(
            uniswapPositionManager
        );
        market.uniswapSwapRouter = ISwapRouter(uniswapSwapRouter);
        market.uniswapQuoter = IUniswapV3Quoter(uniswapQuoter);
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

    function withdrawCollateral(
        Data storage self,
        address user,
        uint256 amount
    ) internal {
        self.collateralAsset.safeTransfer(user, amount);
    }
    
    function transferOwnership(Data storage self, address newOwner) internal {
        self.pendingOwner = newOwner;
    }

    function acceptOwnership(Data storage self) internal {
        address sender = msg.sender;
        if (self.pendingOwner != sender) {
            revert Errors.OwnableUnauthorizedAccount(sender);
        }
        address oldOwner = self.owner;
        self.owner = sender;
        delete self.pendingOwner;
    }

    function pendingOwner(Data storage self) internal view returns (address) {
        return self.pendingOwner;
    }
}
