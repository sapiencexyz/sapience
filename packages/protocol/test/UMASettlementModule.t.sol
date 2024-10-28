// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../src/market/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../src/market/external/IMintableToken.sol";
import {TickMath} from "../src/market/external/univ3/TickMath.sol";
import {TestEpoch} from "./helpers/TestEpoch.sol";
import {TestUser} from "./helpers/TestUser.sol";
import {DecimalPrice} from "../src/market/libraries/DecimalPrice.sol";

contract UmaSettleMarket is TestEpoch {
    using Cannon for Vm;

    IFoil foil;
    IMintableToken bondCurrency;

    uint256 epochId;
    address owner;
    address optimisticOracleV3;
    uint256 endTime;
    uint256 minPriceD18;
    uint256 maxPriceD18;
    IFoilStructs.EpochParams epochParams;
    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    IFoilStructs.EpochData epochData;
    IFoilStructs.EpochData initialEpochData;

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
        (foil, ) = createEpoch(
            16000,
            29800,
            startingSqrtPriceX96,
            MIN_TRADE_SIZE
        );

        (owner, , , , ) = foil.getMarket();
        (
            IFoilStructs.EpochData memory initialEpochData,
            IFoilStructs.EpochParams memory _epochParams
        ) = foil.getLatestEpoch();
        epochId = initialEpochData.epochId;
        endTime = initialEpochData.endTime;
        minPriceD18 = initialEpochData.minPriceD18;
        maxPriceD18 = initialEpochData.maxPriceD18;
        epochParams = _epochParams;

        bondCurrency.mint(epochParams.bondAmount * 2, owner);
    }

    function test_only_owner_settle() public {
        vm.warp(endTime + 1);
        vm.expectRevert("Only owner can call this function");
        foil.submitSettlementPrice(epochId, SQRT_PRICE_11Eth);
    }

    function test_settle_in_range() public {
        IFoilStructs.EpochData memory epochData;
        bool settled;
        uint256 settlementPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();
        IFoilStructs.EpochData memory initialEpochData;
        (epochData, ) = foil.getLatestEpoch();
        assertTrue(!epochData.settled, "The epoch isn't settled");

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (epochData, ) = foil.getLatestEpoch();
        assertTrue(epochData.settled, "The epoch is settled");
        assertTrue(
            epochData.settlementPriceD18 == COMPUTED_10EthPrice,
            "The settlement price is as submitted"
        );
    }

    function test_settle_above_range() public {
        IFoilStructs.EpochData memory epochData;
        (initialEpochData, ) = foil.getLatestEpoch();
        uint256 _minPriceD18 = initialEpochData.minPriceD18;
        uint256 _maxPriceD18 = initialEpochData.maxPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            maxPriceSqrtX96PlusOne
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (epochData, ) = foil.getLatestEpoch();
        assertTrue(
            epochData.settlementPriceD18 == _maxPriceD18,
            "The settlement price is the maximum"
        );
    }

    function test_settle_below_range() public {
        IFoilStructs.EpochData memory epochData;
        (initialEpochData, ) = foil.getLatestEpoch();
        uint256 _minPriceD18 = initialEpochData.minPriceD18;
        uint256 _maxPriceD18 = initialEpochData.maxPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            minPriceSqrtX96MinusOne
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (epochData, ) = foil.getLatestEpoch();
        assertTrue(
            epochData.settlementPriceD18 == _minPriceD18,
            "The settlement price is the minimum"
        );
    }

    function test_settle_too_early() public {
        IFoilStructs.EpochData memory epochData;
        vm.warp(endTime - 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        vm.expectRevert("Market epoch activity is still allowed");
        foil.submitSettlementPrice(epochId, minPriceSqrtX96MinusOne);
        vm.stopPrank();
    }

    function test_settle_too_late() public {
        IFoilStructs.EpochData memory epochData;
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        vm.expectRevert("Market epoch already settled");
        foil.submitSettlementPrice(epochId, SQRT_PRICE_10Eth);
        vm.stopPrank();
    }

    function test_settle_after_dispute() public {
        IFoilStructs.EpochData memory epochData;
        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(
            epochId,
            SQRT_PRICE_10Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionDisputedCallback(assertionId);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (epochData, ) = foil.getLatestEpoch();
        assertTrue(!epochData.settled, "The epoch is not settled");

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId2 = foil.submitSettlementPrice(
            epochId,
            SQRT_PRICE_11Eth
        );
        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        foil.assertionResolvedCallback(assertionId2, true);
        vm.stopPrank();

        (epochData, ) = foil.getLatestEpoch();
        assertTrue(
            epochData.settlementPriceD18 == COMPUTED_11EthPrice,
            "The settlement price is the undisputed value"
        );
    }

    function test_revert_if_assertion_already_submitted() public {
        bool settled;
        uint256 settlementPriceD18;

        vm.warp(endTime + 1);

        vm.startPrank(owner);
        IMintableToken(epochParams.bondCurrency).approve(
            address(foil),
            epochParams.bondAmount
        );
        bytes32 assertionId = foil.submitSettlementPrice(epochId, 10 ether);

        vm.expectRevert("Assertion already submitted");
        foil.submitSettlementPrice(epochId, 10 ether);

        vm.stopPrank();

        vm.startPrank(optimisticOracleV3);
        foil.assertionResolvedCallback(assertionId, true);
        vm.stopPrank();

        (, , , , , , , , settled, settlementPriceD18, ) = foil.getLatestEpoch();
        assertTrue(settled, "The epoch is settled");
        assertTrue(
            settlementPriceD18 == 10 ether,
            "The settlement price is as submitted"
        );
    }
}
