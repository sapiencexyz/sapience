// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {ReentrancyGuard} from "../storage/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../storage/Epoch.sol";

contract EpochUMASettlementModule is ReentrancyGuard {
    // using Epoch for Epoch.Data;
    // using Position for Position.Data;
    using SafeERC20 for IERC20;

    event SettlementSubmitted(uint256 price, uint256 submissionTime);
    event SettlementDisputed(uint256 disputeTime);
    event MarketSettled(uint256 settlementPrice);

    modifier afterEndTime(uint256 epochId) {
        Epoch.Data storage epoch = Epoch.load(epochId);
        require(
            block.timestamp > epoch.endTime,
            "Market activity is still allowed"
        );
        _;
    }

    function submitSettlementPrice(
        uint256 epochId,
        uint256 settlementPrice
    ) external afterEndTime(epochId) nonReentrant returns (bytes32) {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(epochId);
        require(
            msg.sender == market.owner,
            "Only owner can call this function"
        );
        require(!epoch.settled, "Market already settled");

        IERC20 bondCurrency = IERC20(epoch.params.bondCurrency);
        OptimisticOracleV3Interface optimisticOracleV3 = market
            .optimisticOracleV3;

        bondCurrency.safeTransferFrom(
            msg.sender,
            address(this),
            epoch.params.bondAmount
        );
        bondCurrency.forceApprove(
            address(optimisticOracleV3),
            epoch.params.bondAmount
        );

        epoch.settlement = Epoch.Settlement({
            settlementPrice: settlementPrice,
            submissionTime: block.timestamp,
            disputed: false,
            disputer: address(0)
        });

        bytes memory claim = abi.encodePacked(
            epoch.params.priceUnit,
            " TWAP between timestamps ",
            abi.encodePacked(epoch.startTime),
            " and ",
            abi.encodePacked(epoch.endTime),
            " (inclusive): ",
            abi.encodePacked(settlementPrice)
        );

        epoch.assertionId = optimisticOracleV3.assertTruth(
            claim,
            msg.sender,
            address(this),
            address(0),
            epoch.params.assertionLiveness,
            IERC20(epoch.params.bondCurrency),
            uint64(epoch.params.bondAmount),
            bytes32(0),
            bytes32(0)
        );

        emit SettlementSubmitted(settlementPrice, block.timestamp);

        return epoch.assertionId;
    }

    function assertionResolvedCallback(
        uint256 epochId,
        bytes32 assertionId,
        bool assertedTruthfully
    ) external afterEndTime(epochId) nonReentrant {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(epochId);
        require(
            msg.sender == address(market.optimisticOracleV3),
            "Invalid caller"
        );
        require(!epoch.settled, "Market already settled");

        Epoch.Settlement storage settlement = epoch.settlement;
        epoch.settlementPrice = settlement.settlementPrice;
        epoch.settled = true;

        emit MarketSettled(settlement.settlementPrice);
    }

    function assertionDisputedCallback(
        uint256 epochId,
        bytes32 assertionId
    ) external afterEndTime(epochId) nonReentrant {
        Market.Data storage market = Market.load();
        Epoch.Data storage epoch = Epoch.load(epochId);
        require(
            msg.sender == address(market.optimisticOracleV3),
            "Invalid caller"
        );

        Epoch.Settlement storage settlement = epoch.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(block.timestamp);
    }
}
