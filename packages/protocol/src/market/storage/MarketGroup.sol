// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "./Errors.sol";
import "../interfaces/ISapienceStructs.sol";
import {Errors} from "./Errors.sol";

library MarketGroup {
    using SafeERC20 for IERC20;

    uint256 constant MIN_COLLATERAL = 10_000; // 10,000 wstETH (in wei);

    struct Data {
        address owner;
        address pendingOwner;
        IERC20 collateralAsset;
        IERC721 feeCollectorNFT;
        uint256 lastMarketId;
        ISapienceStructs.MarketParams marketParams;
        mapping(bytes32 => uint256) marketIdByAssertionId;
        uint256 minTradeSize;
    }

    function load() internal pure returns (Data storage marketGroup) {
        bytes32 slot = keccak256("sapience.market.group");

        assembly {
            marketGroup.slot := slot
        }
    }

    function createValid(
        address owner,
        address collateralAsset,
        address feeCollectorNFT,
        uint256 minTradeSize,
        ISapienceStructs.MarketParams memory marketParams
    ) internal returns (Data storage marketGroup) {
        validateMarketParams(marketParams);

        require(
            IERC20Metadata(collateralAsset).decimals() == 18,
            "collateralAsset must have 18 decimals"
        );

        marketGroup = load();

        // can only be called once
        if (address(marketGroup.collateralAsset) != address(0)) {
            revert Errors.MarketGroupAlreadyCreated();
        }

        marketGroup.owner = owner;
        marketGroup.collateralAsset = IERC20(collateralAsset);
        marketGroup.feeCollectorNFT = IERC721(feeCollectorNFT);
        marketGroup.minTradeSize = minTradeSize;
        marketGroup.marketParams = marketParams;

        // check marketParams.bondAmount is greater than the minimum bond for the assertion currency
        uint256 minUMABond = OptimisticOracleV3Interface(
            marketParams.optimisticOracleV3
        ).getMinimumBond(marketParams.bondCurrency);
        if (marketParams.bondAmount < minUMABond) {
            revert Errors.InvalidBondAmount(
                marketParams.bondAmount,
                minUMABond
            );
        }
    }

    function loadValid() internal view returns (Data storage marketGroup) {
        marketGroup = load();

        if (
            address(marketGroup.marketParams.uniswapPositionManager) ==
            address(0)
        ) {
            revert Errors.InvalidMarketGroup();
        }
    }

    function updateValid(
        ISapienceStructs.MarketParams memory marketParams
    ) internal returns (Data storage marketGroup) {
        validateMarketParams(marketParams);

        marketGroup = load();

        marketGroup.marketParams = marketParams;
    }

    function validateMarketParams(
        ISapienceStructs.MarketParams memory marketParams
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
            marketParams.assertionLiveness > 0,
            "assertionLiveness must be greater than 0"
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

    function getNewMarketId(Data storage self) internal returns (uint256) {
        self.lastMarketId++;
        return self.lastMarketId;
    }

    function withdrawCollateral(
        Data storage self,
        address user,
        uint256 amount
    ) internal returns (uint256 withdrawnAmount) {
        uint256 balance = self.collateralAsset.balanceOf(address(this));
        withdrawnAmount = amount > balance ? balance : amount;

        self.collateralAsset.safeTransfer(user, withdrawnAmount);
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
