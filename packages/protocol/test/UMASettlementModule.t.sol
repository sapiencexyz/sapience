// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {ISapience} from "../src/market/interfaces/ISapience.sol";
import {ISapienceStructs} from "../src/market/interfaces/ISapienceStructs.sol";
import {IMintableToken} from "../src/market/external/IMintableToken.sol";
import {TickMath} from "../src/market/external/univ3/TickMath.sol";
import {TestMarket} from "./helpers/TestMarket.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/market/libraries/DecimalPrice.sol";

contract UmaSettleMarket is TestMarket {
    using Cannon for Vm;

    ISapience sapience;
    IMintableToken bondCurrency;

    uint256 marketId;
    address owner;
    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    ISapienceStructs.MarketParams marketParams;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vBase

    uint160 minPriceSqrtX96 = 176318465955203702497835220992;
    uint160 maxPriceSqrtX96 = 351516737644262680948788690944;

    uint160 minPriceSqrtX96MinusOne = 157515395125078639904557105152;
    uint160 maxPriceSqrtX96PlusOne = 363781735724983009021857366016;

    uint160 SQRT_PRICE_10Eth = 250541448375047931186413801569;
    uint160 SQRT_PRICE_11Eth = 262770087889115504578498920448;

    uint256 COMPUTED_11EthPrice = 10999999999999999740;
    uint256 COMPUTED_10EthPrice = 9999999999999999999;

    function setUp() public {
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        uint160 startingSqrtPriceX96 = SQRT_PRICE_10Eth; // 10
        (sapience, ) = createMarket(
            16000,
            29800,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE,
            "wstGwei/quote"
        );

        (owner, , , ) = sapience.getMarketGroup();
        (
            ISapienceStructs.MarketData memory _initialMarketData,
            ISapienceStructs.MarketParams memory _marketParams
        ) = sapience.getLatestMarket();
        marketId = _initialMarketData.marketId;
        endTime = _initialMarketData.endTime;
        minPriceD18 = _initialMarketData.minPriceD18;
        maxPriceD18 = _initialMarketData.maxPriceD18;
        marketParams = _marketParams;

        bondCurrency.mint(marketParams.bondAmount * 2, owner);
    }

    function test_only_owner_settle() public {
        vm.warp(endTime + 1);
        vm.expectRevert("Only owner can call this function");
        sapience.submitSettlementPrice(marketId, address(0), SQRT_PRICE_11Eth);
    }

    function test_settle_in_range() public {
        ISapienceStructs.MarketData memory marketData;
        // bool settled;
        // uint256 settlementPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();
        // ISapienceStructs.MarketData memory initialMarketData;
        (marketData, ) = sapience.getLatestMarket();
        assertTrue(!marketData.settled, "The market isn't settled");

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (marketData, ) = sapience.getLatestMarket();
        assertTrue(marketData.settled, "The market is settled");
        assertTrue(
            marketData.settlementPriceD18 == COMPUTED_10EthPrice,
            "The settlement price is as submitted"
        );
    }

    function test_settle_above_range() public {
        ISapienceStructs.MarketData memory marketData;
        (ISapienceStructs.MarketData memory initialMarketData, ) = sapience
            .getLatestMarket();
        uint256 _maxPriceD18 = initialMarketData.maxPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            maxPriceSqrtX96PlusOne
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (marketData, ) = sapience.getLatestMarket();
        assertTrue(
            marketData.settlementPriceD18 == _maxPriceD18,
            "The settlement price is the maximum"
        );
    }

    function test_settle_below_range() public {
        ISapienceStructs.MarketData memory marketData;
        (ISapienceStructs.MarketData memory initialMarketData, ) = sapience
            .getLatestMarket();
        uint256 _minPriceD18 = initialMarketData.minPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            minPriceSqrtX96MinusOne
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (marketData, ) = sapience.getLatestMarket();
        assertTrue(
            marketData.settlementPriceD18 == _minPriceD18,
            "The settlement price is the minimum"
        );
    }

    function test_settle_too_early() public {
        vm.warp(endTime - 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        vm.expectRevert("Market activity is still allowed");
        sapience.submitSettlementPrice(
            marketId,
            owner,
            minPriceSqrtX96MinusOne
        );
        vm.stopPrank();
    }

    function test_settle_too_late() public {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        vm.expectRevert("Market already settled");
        sapience.submitSettlementPrice(marketId, owner, SQRT_PRICE_10Eth);
        vm.stopPrank();
    }

    function test_settle_after_dispute() public {
        ISapienceStructs.MarketData memory marketData;
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionDisputedCallback(assertionId);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (marketData, ) = sapience.getLatestMarket();
        assertTrue(!marketData.settled, "The market is not settled");

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId2 = sapience.submitSettlementPrice(
            marketId,
            owner,
            SQRT_PRICE_11Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        sapience.assertionResolvedCallback(assertionId2, true);
        vm.stopPrank();

        (marketData, ) = sapience.getLatestMarket();
        assertTrue(
            marketData.settlementPriceD18 == COMPUTED_11EthPrice,
            "The settlement price is the undisputed value"
        );
    }

    function test_revert_if_assertion_already_submitted() public {
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(marketParams.bondCurrency).approve(
            address(sapience),
            marketParams.bondAmount
        );
        bytes32 assertionId = sapience.submitSettlementPrice(
            marketId,
            owner,
            250541448375047946302209916928
        ); // 10 ether

        vm.expectRevert("Assertion already submitted");
        sapience.submitSettlementPrice(marketId, owner, 10 ether);

        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        sapience.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (ISapienceStructs.MarketData memory marketData, ) = sapience
            .getLatestMarket();
        assertTrue(marketData.settled, "The market is settled");
        assertApproxEqAbs(
            marketData.settlementPriceD18,
            10 ether,
            1e4,
            "The settlement price is as submitted"
        );
    }
}
