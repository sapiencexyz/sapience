// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ERC165Helper} from "@synthetixio/core-contracts/contracts/utils/ERC165Helper.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "./Errors.sol";
import "../interfaces/IFoilStructs.sol";
import {IResolutionCallback} from "../../vault/interfaces/IResolutionCallback.sol";
import {Errors} from "./Errors.sol";

library Market {
    using SafeERC20 for IERC20;

    struct Data {
        address owner;
        address pendingOwner;
        IResolutionCallback callbackRecipient;
        IERC20 collateralAsset;
        IERC721 feeCollectorNFT;
        uint256 lastEpochId;
        IFoilStructs.MarketParams marketParams;
        mapping(bytes32 => uint256) epochIdByAssertionId;
        uint256 minTradeSize;
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
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams memory marketParams
    ) internal returns (Data storage market) {
        validateEpochParams(marketParams);

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
        market.minTradeSize = minTradeSize;
        market.marketParams = marketParams;

        if (callbackRecipient != address(0)) {
            if (
                !ERC165Helper.safeSupportsInterface(
                    callbackRecipient,
                    type(IResolutionCallback).interfaceId
                )
            ) {
                revert Errors.InvalidCallbackResolutionInterface(
                    address(callbackRecipient)
                );
            }
        }

        market.callbackRecipient = IResolutionCallback(callbackRecipient);
    }

    function loadValid() internal view returns (Data storage market) {
        market = load();

        if (address(market.marketParams.uniswapPositionManager) == address(0)) {
            revert Errors.InvalidMarket();
        }
    }

    function updateValid(
        IFoilStructs.MarketParams memory marketParams
    ) internal returns (Data storage market) {
        validateEpochParams(marketParams);

        market = load();

        market.marketParams = marketParams;
    }

    function validateEpochParams(
        IFoilStructs.MarketParams memory marketParams
    ) internal pure {
        uint24 feeRate = marketParams.feeRate;
        if (
            feeRate != 100 &&
            feeRate != 500 &&
            feeRate != 3000 &&
            feeRate != 10000
        ) {
            revert Errors.InvalidFeeRate(feeRate);
        }

        require(
            marketParams.assertionLiveness >= 6 hours,
            "assertionLiveness must be at least six hours"
        );
        require(
            marketParams.bondCurrency != address(0),
            "bondCurrency must be a non-zero address"
        );
        require(
            marketParams.bondAmount > 0,
            "bondAmount must be greater than 0"
        );
        require(
            marketParams.claimStatement.length > 0,
            "claimStatement must be non-empty"
        );
        require(
            marketParams.uniswapPositionManager != address(0),
            "uniswapPositionManager must be a non-zero address"
        );
        require(
            marketParams.uniswapSwapRouter != address(0),
            "uniswapSwapRouter must be a non-zero address"
        );
        require(
            marketParams.uniswapQuoter != address(0),
            "uniswapQuoter must be a non-zero address"
        );
        require(
            marketParams.optimisticOracleV3 != address(0),
            "optimisticOracleV3 must be a non-zero address"
        );
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
