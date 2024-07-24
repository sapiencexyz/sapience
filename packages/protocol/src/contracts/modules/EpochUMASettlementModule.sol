// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../storage/Epoch.sol";
import "../storage/FAccount.sol";
import "../storage/Position.sol";

contract EpochUMASettlementModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using FAccount for FAccount.Data;
    using Position for Position.Data;
    using SafeERC20 for IERC20;

    event SettlementSubmitted(uint256 price, uint256 submissionTime);
    event SettlementDisputed(uint256 disputeTime);
    event MarketSettled(uint256 settlementPrice);

    modifier onlyAsserter() {
        Epoch.Data storage epoch = Epoch.load();
        require(msg.sender == epoch.asserter, "Only asserter can call this function");
        _;
    }

    modifier afterEndTime() { 
        Epoch.Data storage epoch = Epoch.load();
        require(block.timestamp > epoch.endTime, "Market activity is still allowed");
        _;
    }

    function submitSettlementPrice(uint256 settlementPrice) external onlyAsserter afterEndTime nonReentrant returns (bytes32) {
        Epoch.Data storage epoch = Epoch.load();
        require(!epoch.settled, "Market already settled");

        IERC20 bondCurrency = epoch.bondCurrency;
        OptimisticOracleV3Interface optimisticOracleV3 = epoch.optimisticOracleV3;

        bondCurrency.safeTransferFrom(msg.sender, address(this), epoch.bondAmount);
        bondCurrency.forceApprove(address(optimisticOracleV3), epoch.bondAmount);

        epoch.settlement = Epoch.Settlement({
            settlementPrice: settlementPrice,
            submissionTime: block.timestamp,
            disputed: false,
            disputer: address(0)
        });

        bytes memory claim = abi.encodePacked(
            epoch.priceUnit,
            " between timestamps ",
            abi.encodePacked(epoch.startTime),
            " and ",
            abi.encodePacked(epoch.endTime),
            ": ",
            abi.encodePacked(settlementPrice)
        );

        epoch.assertionId = optimisticOracleV3.assertTruth(
            claim,
            msg.sender,
            address(this), // Callback recipient
            address(0), // No bond currency address
            uint64(epoch.bondAmount),
            epoch.bondCurrency,
            epoch.assertionLiveness,
            bytes32(0),
            bytes32(0)
        );

        emit SettlementSubmitted(settlementPrice, block.timestamp);

        return epoch.assertionId;
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external afterEndTime nonReentrant {
        Epoch.Data storage epoch = Epoch.load();
        require(msg.sender == address(epoch.optimisticOracleV3), "Invalid caller");
        require(!epoch.settled, "Market already settled");

        Epoch.Settlement storage settlement = epoch.settlement;
        epoch.settlementPrice = settlement.settlementPrice;
        epoch.settled = true;

        emit MarketSettled(settlement.settlementPrice);
    }

    function assertionDisputedCallback(bytes32 assertionId) external {
        Epoch.Data storage epoch = Epoch.load();
        require(msg.sender == address(epoch.optimisticOracleV3), "Invalid caller");

        Epoch.Settlement storage settlement = epoch.settlement;
        settlement.disputed = true;

        emit SettlementDisputed(block.timestamp);
    }
}
