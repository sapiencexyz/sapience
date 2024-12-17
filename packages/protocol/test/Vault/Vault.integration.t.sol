// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {INonfungiblePositionManager} from "../../src/market/interfaces/external/INonfungiblePositionManager.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract VaultIntegrationTest is TestVault {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    IFoil foil;
    IVault vault;
    IMintableToken collateralAsset;

    uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
    uint256 epochStartTime;

    uint256 DEFAULT_DURATION = 2419200; // 28 days in seconds
    uint256 INITIAL_LP_BALANCE = 100_000 ether;
    // IFoilStructs.EpochData epochData;

    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 constant BOND_AMOUNT = 100 ether;

    address lp1;
    address lp2;
    address lp3;
    address lp4;
    address lp5;

    address trader1;
    address trader2;

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);
        lp2 = TestUser.createUser("LP2", INITIAL_LP_BALANCE);
        lp3 = TestUser.createUser("LP3", INITIAL_LP_BALANCE);
        lp4 = TestUser.createUser("LP4", INITIAL_LP_BALANCE);
        lp5 = TestUser.createUser("LP5", INITIAL_LP_BALANCE);

        trader1 = TestUser.createUser("Trader1", 100 ether);
        trader2 = TestUser.createUser("Trader2", 100 ether);

        (foil, vault, collateralAsset) = initializeVault(
            feeCollectors,
            BOND_AMOUNT,
            MIN_TRADE_SIZE
        );

        vm.prank(lp1);
        vault.requestDeposit(10 ether);

        vm.prank(lp2);
        vault.requestDeposit(5 ether);

        epochStartTime = block.timestamp + 60;
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        // collect deposits
        vm.prank(lp1);
        vault.deposit(0, lp1);

        vm.prank(lp2);
        vault.deposit(0, lp2);
    }

    function traderBuysGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();

        vm.startPrank(trader);
        traderPositionId = addTraderPosition(
            foil,
            epochData.epochId,
            int256(amount)
        );
        vm.stopPrank();
    }

    function traderSellsGas(
        address trader,
        uint256 amount
    ) internal returns (uint256 traderPositionId) {
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();

        vm.startPrank(trader);
        traderPositionId = addTraderPosition(
            foil,
            epochData.epochId,
            -int256(amount)
        );
        vm.stopPrank();
    }

    function settleCurrentEpoch() public returns (uint256 sharePrice) {
        // Warp to end of epoch
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        vm.warp(epochData.endTime + 1);
        // Settle at current pool price
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();
        settleEpoch(epochData.epochId, sqrtPriceX96, address(vault));

        // After settlement, pending deposits and withdrawals should be 0
        (uint256 pendingDeposits, uint256 pendingWithdrawals, ) = vault
            .pendingValues();
        assertEq(
            pendingDeposits,
            0,
            "Pending deposits should be 0 after settlement"
        );
        assertEq(
            pendingWithdrawals,
            0,
            "Pending withdrawals should be 0 after settlement"
        );

        return vault.epochSharePrice(epochData.epochId);
    }

    function checkPendingValues(
        uint256 expectedDeposits,
        uint256 expectedWithdrawals
    ) internal view {
        (uint256 pendingDeposits, uint256 pendingWithdrawals, ) = vault
            .pendingValues();
        assertEq(
            pendingDeposits,
            expectedDeposits,
            "Incorrect pending deposits"
        );
        assertEq(
            pendingWithdrawals,
            expectedWithdrawals,
            "Incorrect pending withdrawals"
        );
    }

    function test_nextEpoch() public {
        // ============= EPOCH 1 =============
        traderBuysGas(trader1, 0.5 ether);
        traderSellsGas(trader2, 0.1 ether);

        vm.prank(lp3);
        vault.requestDeposit(5 ether);
        vm.prank(lp4);
        vault.requestDeposit(25 ether);
        vm.prank(lp1);
        vault.requestRedeem(5 ether);
        checkPendingValues(30 ether, 5 ether);
        uint256 firstEpochSharePrice = settleCurrentEpoch();

        // ============= EPOCH 2 =============
        // Trader activity
        traderBuysGas(trader1, 0.1 ether);
        traderSellsGas(trader2, 0.6 ether);

        // lp4 deposit
        uint256 expectedLp4Shares = (25 ether * 1e18) / firstEpochSharePrice;
        vm.prank(lp4);
        uint256 actualLp4Shares = vault.deposit(0, lp4);
        assertEq(
            actualLp4Shares,
            expectedLp4Shares,
            "LP4 shares minted incorrectly"
        );

        // lp1 redeem
        vm.prank(lp1);
        uint256 actualLp1Assets = vault.redeem(lp1);
        uint256 expectedLp1Assets = (5 ether * firstEpochSharePrice) / 1e18;
        assertEq(
            actualLp1Assets,
            expectedLp1Assets,
            "LP1 assets redeemed incorrectly"
        );

        // Verify lp3 cannot request deposit while previous deposit is pending
        vm.prank(lp3);
        vm.expectRevert("Previous deposit request is not in the same epoch");
        vault.requestDeposit(1 ether);

        // Verify lp3 cannot request redeem while deposit is pending
        vm.prank(lp3);
        vm.expectRevert("Cannot redeem while deposit is pending");
        vault.requestRedeem(1 ether);

        // lp5 requests deposit
        vm.prank(lp5);
        vault.requestDeposit(15 ether);

        uint256 secondEpochSharePrice = settleCurrentEpoch();

        // ============= EPOCH 3 =============
        uint256 expectedLp3Shares = (5 ether * 1e18) / firstEpochSharePrice;
        vm.prank(lp3);
        uint256 actualLp3Shares = vault.deposit(0, lp3);
        assertEq(
            actualLp3Shares,
            expectedLp3Shares,
            "LP4 shares minted incorrectly"
        );

        // Check lp5 deposit
        uint256 expectedLp5Shares = (15 ether * 1e18) / secondEpochSharePrice;
        vm.prank(lp5);
        uint256 actualLp5Shares = vault.deposit(0, lp5);
        assertEq(
            actualLp5Shares,
            expectedLp5Shares,
            "LP5 shares minted incorrectly"
        );

        traderBuysGas(trader1, 0.4 ether);
        traderSellsGas(trader2, 0.8 ether);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);
        vm.prank(lp2);
        vault.requestRedeem(5 ether);
        vm.prank(lp3);
        vault.requestRedeem(expectedLp3Shares);
        vm.prank(lp4);
        vault.requestRedeem(expectedLp4Shares);
        vm.prank(lp5);
        vault.requestRedeem(expectedLp5Shares);

        (uint256 pendingDeposits, uint256 pendingWithdrawals, ) = vault
            .pendingValues();
        assertApproxEqAbs(
            pendingWithdrawals,
            vault.totalSupply(),
            1e2,
            "Pending withdrawals should approximately equal total supply"
        );
        assertEq(pendingDeposits, 0, "Pending deposits should be 0");

        redeemAllAndAssert(
            5 ether,
            5 ether,
            expectedLp3Shares,
            expectedLp4Shares,
            expectedLp5Shares
        );
    }

    struct RedeemStack {
        uint256 sharePrice;
        uint256 expectedLp1Assets;
        uint256 actualLp1Assets;
        uint256 expectedLp2Assets;
        uint256 actualLp2Assets;
        uint256 expectedLp3Assets;
        uint256 actualLp3Assets;
        uint256 expectedLp4Assets;
        uint256 actualLp4Assets;
        uint256 expectedLp5Assets;
        uint256 actualLp5Assets;
    }

    function redeemAllAndAssert(
        uint256 expectedLp1Shares,
        uint256 expectedLp2Shares,
        uint256 expectedLp3Shares,
        uint256 expectedLp4Shares,
        uint256 expectedLp5Shares
    ) internal {
        // Check LP1 redemption

        RedeemStack memory stack;

        stack.sharePrice = settleCurrentEpoch();

        // Check LP1 redemption
        vm.prank(lp1);
        stack.expectedLp1Assets = (expectedLp1Shares * stack.sharePrice) / 1e18;
        stack.actualLp1Assets = vault.redeem(lp1);
        assertApproxEqAbs(
            stack.actualLp1Assets,
            stack.expectedLp1Assets,
            1e2,
            "LP1 assets redeemed incorrectly"
        );

        // Check LP2 redemption
        stack.expectedLp2Assets = (expectedLp2Shares * stack.sharePrice) / 1e18;
        vm.prank(lp2);
        stack.actualLp2Assets = vault.redeem(lp2);
        assertApproxEqAbs(
            stack.actualLp2Assets,
            stack.expectedLp2Assets,
            1e2,
            "LP2 assets redeemed incorrectly"
        );

        // Check LP3 redemption
        stack.expectedLp3Assets = (expectedLp3Shares * stack.sharePrice) / 1e18;
        vm.prank(lp3);
        stack.actualLp3Assets = vault.redeem(lp3);
        assertApproxEqAbs(
            stack.actualLp3Assets,
            stack.expectedLp3Assets,
            1e2,
            "LP3 assets redeemed incorrectly"
        );

        // Check LP4 redemption
        stack.expectedLp4Assets = (expectedLp4Shares * stack.sharePrice) / 1e18;
        vm.prank(lp4);
        stack.actualLp4Assets = vault.redeem(lp4);
        assertApproxEqAbs(
            stack.actualLp4Assets,
            stack.expectedLp4Assets,
            1e2,
            "LP4 assets redeemed incorrectly"
        );

        // Check LP5 redemption
        stack.expectedLp5Assets = (expectedLp5Shares * stack.sharePrice) / 1e18;
        vm.prank(lp5);
        stack.actualLp5Assets = vault.redeem(lp5);
        assertApproxEqAbs(
            stack.actualLp5Assets,
            stack.expectedLp5Assets,
            1e2,
            "LP5 assets redeemed incorrectly"
        );

        // Check that total supply is zero after all redemptions
        assertApproxEqAbs(
            vault.totalSupply(),
            0,
            1e2,
            "Total supply should be zero after all redemptions"
        );
    }
}
