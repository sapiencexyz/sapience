// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../external/FeeCollectorNft.sol";
import "../interfaces/IConfigurationModule.sol";
import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import "../storage/Errors.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";

contract ConfigurationModule is
    IConfigurationModule,
    ReentrancyGuardUpgradeable
{
    using MarketGroup for MarketGroup.Data;
    using Market for Market.Data;

    modifier onlyOwner() {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        if (marketGroup.owner == address(0)) {
            revert Errors.MarketNotInitialized();
        }
        if (msg.sender != marketGroup.owner) {
            revert Errors.OnlyOwner();
        }
        _;
    }

    function initializeMarketGroup(
        address initialOwner,
        address collateralAsset,
        address[] calldata feeCollectors,
        uint256 minTradeSize,
        bool bridgedSettlement,
        ISapienceStructs.MarketParams memory marketParams
    ) external override nonReentrant {
        address feeCollectorNFT;
        if (feeCollectors.length > 0) {
            feeCollectorNFT = address(
                new FeeCollectorNft("FeeCollectorNFT", "FCNFT")
            );
            for (uint256 i = 0; i < feeCollectors.length; i++) {
                address feeCollector = feeCollectors[i];
                FeeCollectorNft(feeCollectorNFT).mint(feeCollector);
            }
        }

        MarketGroup.createValid(
            initialOwner,
            collateralAsset,
            feeCollectorNFT,
            minTradeSize,
            bridgedSettlement,
            marketParams
        );
        emit MarketInitialized(
            initialOwner,
            collateralAsset,
            feeCollectorNFT,
            minTradeSize,
            bridgedSettlement,
            marketParams
        );
    }

    function updateMarketGroup(
        ISapienceStructs.MarketParams memory marketParams
    ) external override onlyOwner {
        MarketGroup.updateValid(marketParams);

        emit MarketUpdated(marketParams);
    }

    function createMarket(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        int24 baseAssetMinPriceTick,
        int24 baseAssetMaxPriceTick,
        uint256 salt,
        bytes calldata claimStatementYesOrNumeric,
        bytes calldata claimStatementNo
    ) external override nonReentrant onlyOwner returns (uint256 marketId) {
        // load the market to check if it's already created
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        uint256 newMarketId = marketGroup.getNewMarketId();

        Market.createValid(
            newMarketId,
            startTime,
            endTime,
            startingSqrtPriceX96,
            baseAssetMinPriceTick,
            baseAssetMaxPriceTick,
            salt,
            claimStatementYesOrNumeric,
            claimStatementNo
        );
        emit MarketCreated(newMarketId, startTime, endTime, startingSqrtPriceX96, claimStatementYesOrNumeric, claimStatementNo);

        return newMarketId;
    }

    function transferOwnership(
        address newOwner
    ) external nonReentrant onlyOwner {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        address oldOwner = marketGroup.owner;
        marketGroup.transferOwnership(newOwner);
        emit OwnershipTransferStarted(oldOwner, newOwner);
    }

    function acceptOwnership() external nonReentrant {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        address oldOwner = marketGroup.owner;
        marketGroup.acceptOwnership();
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function pendingOwner() external view returns (address) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        return marketGroup.pendingOwner;
    }

    function owner() external view returns (address) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        return marketGroup.owner;
    }
}
