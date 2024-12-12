// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";

contract VaultRedeemTest is TestVault {
    using Cannon for Vm;

    IFoil foil;
    IVault vault;
    IMintableToken collateralAsset;

    uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
    uint256 epochStartTime;

    uint256 DEFAULT_DURATION = 2419200; // 28 days in seconds
    uint256 INITIAL_LP_BALANCE = 100_000 ether;

    uint256 constant MIN_TRADE_SIZE = 10_000; // 10,000 vGas
    uint256 constant MIN_COLLATERAL = 10_000; // 10,000 wstETH;
    uint256 constant BOND_AMOUNT = 100 ether;

    address lp1;
    address lp2;

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);
        lp2 = TestUser.createUser("LP2", INITIAL_LP_BALANCE);

        (foil, vault, collateralAsset) = initializeVault(
            feeCollectors,
            BOND_AMOUNT,
            MIN_TRADE_SIZE,
            MIN_COLLATERAL
        );

        // Setup initial deposit and shares for lp1
        vm.prank(lp1);
        vault.requestDeposit(10 ether);

        epochStartTime = block.timestamp + 60;

        // Initialize first epoch and mint shares
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vm.prank(lp1);
        vault.deposit(0, lp1);
    }

    function settleCurrentEpoch() public returns (uint256 sharePrice) {
        (IFoilStructs.EpochData memory epochData, ) = foil.getLatestEpoch();
        vm.warp(epochData.endTime + 1);
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(epochData.pool)
            .slot0();
        settleEpoch(epochData.epochId, sqrtPriceX96, address(vault));

        return vault.epochSharePrice(epochData.epochId);
    }

    function test_requestRedeemReverts_whenInsufficientShares() public {
        vm.prank(lp1);
        vm.expectRevert("Insufficient shares to redeem");
        vault.requestRedeem(11 ether);

        vm.prank(lp2);
        vm.expectRevert("Insufficient shares to redeem");
        vault.requestRedeem(1 ether);
    }

    function test_requestRedeemReverts_whenDepositPending() public {
        vm.prank(lp1);
        vault.requestDeposit(1 ether);

        vm.prank(lp1);
        vm.expectRevert("Cannot redeem while deposit is pending");
        vault.requestRedeem(1 ether);
    }

    function test_requestRedeemWorks() public {
        vm.prank(lp1);
        vault.requestRedeem(1 ether);

        assertEq(vault.pendingRedeemRequest(lp1).amount, 1 ether);
    }

    function test_withdrawRequestRedeemReverts_whenNoRequest() public {
        vm.prank(lp1);
        vm.expectRevert("No withdraw request to redeem");
        vault.withdrawRequestRedeem(1 ether);
    }

    function test_withdrawRequestRedeemReverts_whenMoreSharesThanRequest()
        public
    {
        vm.startPrank(lp1);
        vault.requestRedeem(1 ether);

        vm.expectRevert("Insufficient shares to withdraw from request");
        vault.withdrawRequestRedeem(2 ether);
        vm.stopPrank();
    }

    function test_withdrawRequestRedeemReverts_whenRequestInPreviousEpoch()
        public
    {
        vm.prank(lp1);
        vault.requestRedeem(1 ether);

        // Move to next epoch
        settleCurrentEpoch();

        vm.prank(lp1);
        vm.expectRevert("Previous deposit request is not in the same epoch");
        vault.withdrawRequestRedeem(1 ether);
    }

    function test_withdrawRequestRedeemWorks() public {
        vm.prank(lp1);
        vault.requestRedeem(1 ether);

        vm.prank(lp1);
        vault.withdrawRequestRedeem(1 ether);

        IVault.UserPendingTransaction memory pendingTxn = vault
            .pendingRedeemRequest(lp1);
        assertEq(pendingTxn.amount, 0, "Pending redeem amount should be 0");
        assertEq(
            uint8(pendingTxn.transactionType),
            uint8(IVault.TransactionType.NULL),
            "Transaction type should be NULL"
        );
        assertEq(
            pendingTxn.requestInitiatedEpoch,
            0,
            "Request epoch should be 0"
        );
    }

    function test_requestRedeemMultipleTimesAddsAmount() public {
        vm.startPrank(lp1);

        vault.requestRedeem(1 ether);

        IVault.UserPendingTransaction memory pendingTxn = vault
            .pendingRedeemRequest(lp1);
        assertEq(
            pendingTxn.amount,
            1 ether,
            "First redeem request amount should be 1 ether"
        );

        vault.requestRedeem(2 ether);

        pendingTxn = vault.pendingRedeemRequest(lp1);
        assertEq(
            pendingTxn.amount,
            3 ether,
            "Total redeem request amount should be 3 ether"
        );
        assertEq(
            uint8(pendingTxn.transactionType),
            uint8(IVault.TransactionType.WITHDRAW),
            "Transaction type should be WITHDRAW"
        );
        assertEq(
            pendingTxn.requestInitiatedEpoch,
            1,
            "Request epoch should be 1"
        );

        (, uint256 totalPendingWithdrawals, ) = vault.pendingValues();
        assertEq(
            totalPendingWithdrawals,
            3 ether,
            "Total pending withdrawals should be 3 ether"
        );

        vm.stopPrank();
    }

    function test_requestRedeemMoreThanBalance() public {
        vm.startPrank(lp1);

        vault.requestRedeem(1 ether);
        settleCurrentEpoch();
        vault.redeem(lp1);

        // Try to redeem more than remaining balance
        vm.expectRevert("Insufficient shares to redeem");
        vault.requestRedeem(10 ether);

        vm.stopPrank();
    }

    function test_claimableRedeemRequest_returnsZero() public {
        vm.prank(lp1);
        vault.requestRedeem(1 ether);

        uint256 collateralAmount = vault.claimableRedeemRequest(lp1);
        assertEq(collateralAmount, 0, "Collateral amount should be 0");

        (, uint256 totalPendingWithdrawals, ) = vault.pendingValues();
        assertEq(
            totalPendingWithdrawals,
            1 ether,
            "Total pending withdrawals should be 1 ether"
        );
    }

    function test_claimableRedeemRequest_returnsCorrectAmount() public {
        vm.prank(lp1);
        vault.requestRedeem(1 ether);

        settleCurrentEpoch();

        uint256 collateralAmount = vault.claimableRedeemRequest(lp1);
        assertApproxEqAbs(
            collateralAmount,
            1 ether,
            1e2,
            "Collateral amount should be near 1 ether"
        );
    }

    // MINT/REDEEM TESTS
    function test_redeemRevertsWhenNoRequest() public {
        vm.prank(lp1);
        vm.expectRevert("No withdraw request to redeem");
        vault.redeem(lp1);
    }

    function test_redeemRevertsWhenNoRequestAfterSettle() public {
        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.prank(lp2);
        vm.expectRevert("No withdraw request to redeem");
        vault.redeem(lp2);
    }

    function test_redeemRevertsWhenDepositRequest() public {
        vm.prank(lp1);
        vault.requestDeposit(1 ether);

        vm.prank(lp1);
        vm.expectRevert("No withdraw request to redeem");
        vault.redeem(lp1);
    }

    function test_redeemRevertsWhenRequestInSameEpoch() public {
        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.prank(lp1);
        vm.expectRevert("Previous withdraw request is in the current epoch");
        vault.redeem(lp1);
    }

    function test_redeemWorksAfterSettling() public {
        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        settleCurrentEpoch();

        vm.prank(lp1);
        vault.redeem(lp1);

        (, , uint256 pendingSharesToBurn) = vault.pendingValues();
        assertEq(pendingSharesToBurn, 0, "Pending shares to burn should be 0");

        assertEq(
            vault.balanceOf(lp1),
            5 ether,
            "LP1 balance should be reduced by 5 ether after redeeming"
        );
    }
}
