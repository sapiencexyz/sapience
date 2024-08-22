// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Epoch} from "../storage/Epoch.sol";
import {Market} from "../storage/Market.sol";
import {IEpochUMASettlementModule} from "../interfaces/IEpochUMASettlementModule.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";

contract EpochUMASettlementModule is IEpochUMASettlementModule, ReentrancyGuard {
    using Epoch for Epoch.Data;

    function submitSettlementPrice(
        uint256 epochId,
        uint256 settlementPriceD18
    ) external nonReentrant returns (bytes32) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.loadValid(epochId);

        require(block.timestamp > epoch.endTime, "Market activity is still allowed");
        require(
            msg.sender == market.owner,
            "Only owner can call this function"
        );
        require(!epoch.settled, "Market already settled");

        IERC20 bondCurrency = IERC20(epoch.params.bondCurrency);
        OptimisticOracleV3Interface optimisticOracleV3 = market
            .optimisticOracleV3;

        bondCurrency.transferFrom(
            msg.sender,
            address(this),
            epoch.params.bondAmount
        );
        bondCurrency.approve(
            address(optimisticOracleV3),
            epoch.params.bondAmount
        );

        bytes memory claim = abi.encodePacked(
            "ipfs://Qmbg1KiuKNmCbL696Zu8hXUAJrTxuhgNCbyjaPyni4RXTc evaluates to ",
            abi.encodePacked(settlementPriceD18),
            " ",
            epoch.params.priceUnit,
            " with start time ",
            abi.encodePacked(epoch.startTime),
            " and end time ",
            abi.encodePacked(epoch.endTime)
        );

        epoch.assertionId = optimisticOracleV3.assertTruth(
            claim,
            msg.sender,
            address(this),
            address(0),
            epoch.params.assertionLiveness,
            IERC20(epoch.params.bondCurrency),
            epoch.params.bondAmount,
            optimisticOracleV3.defaultIdentifier(),
            bytes32(0)
        );

        market.epochIdByAssertionId[epoch.assertionId] = epochId;

        epoch.settlement = Epoch.Settlement({
            settlementPriceD18: settlementPriceD18,
            submissionTime: block.timestamp,
            disputed: false,
            disputer: address(0)
        });

        emit SettlementSubmitted(epochId, settlementPriceD18, block.timestamp);

        return epoch.assertionId;
    }

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external {
        Market.Data storage market = Market.load();

        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        require(assertionId == epoch.assertionId, "Invalid assertionId");
        require(block.timestamp > epoch.endTime, "Market activity is still allowed");
        require(
            msg.sender == address(market.optimisticOracleV3),
            "Invalid caller"
        );
        require(!epoch.settled, "Market already settled");

        Epoch.Settlement storage settlement = epoch.settlement;

        if(!epoch.settlement.disputed) {
            epoch.setSettlementPriceInRange(settlement.settlementPriceD18);
            epoch.settled = true;
            emit MarketSettled(epochId, assertionId, settlement.settlementPriceD18);
        }
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        Market.Data storage market = Market.load();

        uint256 epochId = market.epochIdByAssertionId[assertionId];
        Epoch.Data storage epoch = Epoch.load(epochId);

        require(block.timestamp > epoch.endTime, "Market activity is still allowed");
        require(
            msg.sender == address(market.optimisticOracleV3),
            "Invalid caller"
        );

        Epoch.Settlement storage settlement = epoch.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(epochId, block.timestamp);
    }
}