// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {Epoch} from "../storage/Epoch.sol";
import {Market} from "../storage/Market.sol";
import {IUMASettlementModule} from "../interfaces/IUMASettlementModule.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "../libraries/DecimalPrice.sol";

contract UMASettlementModule is
    IUMASettlementModule,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using Epoch for Epoch.Data;

    function submitSettlementPrice(
        uint256 epochId,
        address asserter,
        uint160 settlementSqrtPriceX96
    ) external nonReentrant returns (bytes32) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.loadValid(epochId);

        validateSubmission(epoch, market, msg.sender);

        require(epoch.assertionId == bytes32(0), "Assertion already submitted");

        IERC20 bondCurrency = IERC20(epoch.marketParams.bondCurrency);
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                epoch.marketParams.optimisticOracleV3
            );

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            epoch.marketParams.bondAmount
        );
        bondCurrency.approve(
            address(optimisticOracleV3),
            epoch.marketParams.bondAmount
        );

        uint256 decimalPrice = DecimalPrice.sqrtRatioX96ToPrice(
            settlementSqrtPriceX96
        );

        bytes memory claim = abi.encodePacked(
            string(epoch.claimStatement),
            Strings.toString(decimalPrice),
            "."
        );

        epoch.assertionId = optimisticOracleV3.assertTruth(
            claim,
            asserter,
            address(this),
            address(0),
            epoch.marketParams.assertionLiveness,
            IERC20(epoch.marketParams.bondCurrency),
            epoch.marketParams.bondAmount,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        market.epochIdByAssertionId[epoch.assertionId] = epochId;

        epoch.settlement = Epoch.Settlement({
            settlementPriceSqrtX96: settlementSqrtPriceX96,
            submissionTime: block.timestamp,
            disputed: false
        });

        emit SettlementSubmitted(
            epochId,
            asserter,
            settlementSqrtPriceX96,
            block.timestamp
        );

        return epoch.assertionId;
    }

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        assertedTruthfully;
        Market.Data storage market = Market.load();
        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        validateUMACallback(epoch, msg.sender, assertionId);

        Epoch.Settlement storage settlement = epoch.settlement;

        if (!epoch.settlement.disputed) {
            epoch.setSettlementPriceInRange(
                DecimalPrice.sqrtRatioX96ToPrice(
                    settlement.settlementPriceSqrtX96
                )
            );

            // Call the callback recipient
            if (address(market.callbackRecipient) != address(0)) {
                try
                    market.callbackRecipient.resolutionCallback(
                        settlement.settlementPriceSqrtX96
                    )
                // multiple catches by design to ensure any error is caught/logged
                {

                } catch Error(string memory reason) {
                    emit ResolutionCallbackFailure(
                        bytes(reason),
                        settlement.settlementPriceSqrtX96
                    );
                } catch (bytes memory reason) {
                    emit ResolutionCallbackFailure(
                        reason,
                        settlement.settlementPriceSqrtX96
                    );
                }
            }

            emit EpochSettled(
                epochId,
                assertionId,
                settlement.settlementPriceSqrtX96
            );
        }

        // clear the assertionId
        epoch.assertionId = bytes32(0);
    }

    function assertionDisputedCallback(
        bytes32 assertionId
    ) external nonReentrant {
        Market.Data storage market = Market.load();
        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        validateUMACallback(epoch, msg.sender, assertionId);

        Epoch.Settlement storage settlement = epoch.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(epochId, block.timestamp);
    }

    function validateSubmission(
        Epoch.Data storage epoch,
        Market.Data storage market,
        address caller
    ) internal view {
        require(
            block.timestamp >= epoch.endTime,
            "Market epoch activity is still allowed"
        );
        require(!epoch.settled, "Market epoch already settled");
        require(caller == market.owner, "Only owner can call this function");
    }

    function validateUMACallback(
        Epoch.Data storage epoch,
        address caller,
        bytes32 assertionId
    ) internal view {
        OptimisticOracleV3Interface optimisticOracleV3 = OptimisticOracleV3Interface(
                epoch.marketParams.optimisticOracleV3
            );

        require(
            block.timestamp > epoch.endTime,
            "Market epoch activity is still allowed"
        );
        require(!epoch.settled, "Market epoch already settled");
        require(caller == address(optimisticOracleV3), "Invalid caller");
        require(assertionId == epoch.assertionId, "Invalid assertionId");
    }
}
