// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "./Errors.sol";
import "../interfaces/IFoilStructs.sol";

library Market {
    using SafeERC20 for IERC20;

    struct Data {
        address owner;
        address pendingOwner;
        IERC20 collateralAsset;
        IERC721 feeCollectorNFT;
        uint256 lastEpochId;
        IFoilStructs.EpochParams epochParams;
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
        address feeCollectorNFT,
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        validateEpochParams(epochParams);

        require(
            IERC20Metadata(collateralAsset).decimals() == 18,
            "collateralAsset must have 18 decimals"
        );

        market = load();

        // can only be called once
        if (address(market.collateralAsset) != address(0)) {
            revert Errors.MarketAlreadyCreated();
        }

        market.owner = owner;
        market.collateralAsset = IERC20(collateralAsset);
        market.feeCollectorNFT = IERC721(feeCollectorNFT);
        market.epochParams = epochParams;
    }

    function loadValid() internal view returns (Data storage market) {
        market = load();

        if (address(market.epochParams.uniswapPositionManager) == address(0)) {
            revert Errors.InvalidMarket();
        }
    }

    function updateValid(
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (Data storage market) {
        validateEpochParams(epochParams);

        market = load();

        market.epochParams = epochParams;
    }

    function validateEpochParams(
        IFoilStructs.EpochParams memory epochParams
    ) internal pure {
        int24 tickSpacing = getTickSpacingForFee(epochParams.feeRate);

        if (epochParams.baseAssetMinPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMinPriceTick(
                epochParams.baseAssetMinPriceTick,
                tickSpacing
            );
        }

        if (epochParams.baseAssetMaxPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMaxPriceTick(
                epochParams.baseAssetMaxPriceTick,
                tickSpacing
            );
        }

        if (
            epochParams.baseAssetMinPriceTick >=
            epochParams.baseAssetMaxPriceTick
        ) {
            revert Errors.InvalidPriceTickRange(
                epochParams.baseAssetMinPriceTick,
                epochParams.baseAssetMaxPriceTick
            );
        }

        require(
            epochParams.assertionLiveness >= 6 hours,
            "assertionLiveness must be at least six hours"
        );
        require(
            epochParams.bondCurrency != address(0),
            "bondCurrency must be a non-zero address"
        );
        require(
            epochParams.bondAmount > 0,
            "bondAmount must be greater than 0"
        );
        require(
            epochParams.priceUnit.length > 0,
            "priceUnit must be non-empty"
        );
        require(
            epochParams.uniswapPositionManager != address(0),
            "uniswapPositionManager must be a non-zero address"
        );
        require(
            epochParams.uniswapSwapRouter != address(0),
            "uniswapSwapRouter must be a non-zero address"
        );
        require(
            epochParams.uniswapQuoter != address(0),
            "uniswapQuoter must be a non-zero address"
        );
        require(
            epochParams.optimisticOracleV3 != address(0),
            "optimisticOracleV3 must be a non-zero address"
        );
    }

    function getTickSpacingForFee(uint24 fee) internal pure returns (int24) {
        if (fee == 100) {
            return 1;
        } else if (fee == 500) {
            return 10;
        } else if (fee == 3000) {
            return 60;
        } else if (fee == 10000) {
            return 200;
        } else {
            revert Errors.InvalidTickSpacing(fee);
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
        self.owner = sender;
        delete self.pendingOwner;
    }

    function isFeeCollector(
        Data storage self,
        address user
    ) internal view returns (bool) {
        return
            address(self.feeCollectorNFT) != address(0) &&
            self.feeCollectorNFT.balanceOf(user) > 0;
    }
}
