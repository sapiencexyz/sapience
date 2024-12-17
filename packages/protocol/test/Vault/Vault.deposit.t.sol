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

contract VaultDepositTest is TestVault {
    using Cannon for Vm;

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

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        lp1 = TestUser.createUser("LP1", INITIAL_LP_BALANCE);
        lp2 = TestUser.createUser("LP2", INITIAL_LP_BALANCE);

        (foil, vault, collateralAsset) = initializeVault(
            feeCollectors,
            BOND_AMOUNT,
            MIN_TRADE_SIZE
        );

        vm.prank(lp1);
        vault.requestDeposit(10 ether);

        epochStartTime = block.timestamp + 60;
    }

    function test_depositReverts_whenAmountBelowMinimum() public {
        vm.startPrank(lp1);

        uint256 tooSmallAmount = 999; // Less than minimumCollateral (1e3)

        vm.expectRevert("Deposit amount is too low");
        vault.requestDeposit(tooSmallAmount);

        vm.stopPrank();
    }

    function test_pendingTxn_isAccurate() public view {
        IVault.UserPendingTransaction memory pendingTxn = vault.pendingRequest(
            lp1
        );

        assertEq(
            pendingTxn.amount,
            10 ether,
            "Pending deposit amount should be 10 ether"
        );
        assertEq(
            uint8(pendingTxn.transactionType),
            uint8(IVault.TransactionType.DEPOSIT),
            "Transaction type should be DEPOSIT"
        );
        assertEq(
            pendingTxn.requestInitiatedEpoch,
            0,
            "Request epoch should match current epoch"
        );
    }

    function test_depositAgain_whenPendingDeposit() public {
        vm.startPrank(lp1);
        vault.requestDeposit(10 ether);

        IVault.UserPendingTransaction memory pendingTxn = vault.pendingRequest(
            lp1
        );
        assertEq(
            pendingTxn.amount,
            20 ether,
            "Pending deposit amount should be 20 ether"
        );

        vm.stopPrank();
    }

    function test_withdrawRequestReverts_whenAssetLargerThanCurrent() public {
        vm.startPrank(lp1);
        vm.expectRevert("Insufficient deposit request to withdraw");
        vault.withdrawRequestDeposit(11 ether);

        vm.stopPrank();
    }

    function test_withdrawRequestWorks_whenAssetSmallerThanCurrent() public {
        vm.startPrank(lp1);
        vault.withdrawRequestDeposit(5 ether);

        IVault.UserPendingTransaction memory pendingTxn = vault.pendingRequest(
            lp1
        );
        assertEq(
            pendingTxn.amount,
            5 ether,
            "Pending deposit amount should be 5 ether"
        );

        vm.stopPrank();
    }

    function test_withdrawRequestReturnsEverything_whenLeftoverIsBelowMinimum()
        public
    {
        (uint256 totalPendingDepositsBefore, , ) = vault.pendingValues();
        uint256 vaultBalanceBefore = collateralAsset.balanceOf(address(vault));

        vm.startPrank(lp2);
        vault.requestDeposit(10 ether);
        uint256 balanceBefore = collateralAsset.balanceOf(lp2);

        vault.withdrawRequestDeposit(10 ether - 1e7);
        vm.stopPrank();

        IVault.UserPendingTransaction memory pendingTxn = vault.pendingRequest(
            lp2
        );
        assertEq(pendingTxn.amount, 0, "Pending deposit amount should be 0");

        (uint256 totalPendingDeposits, , ) = vault.pendingValues();
        assertEq(
            totalPendingDeposits,
            totalPendingDepositsBefore,
            "Total pending deposits should be same as prior to request"
        );

        uint256 balanceAfter = collateralAsset.balanceOf(lp2);
        assertEq(
            balanceBefore + 10 ether,
            balanceAfter,
            "LP Balance should go up by 10 ether"
        );

        assertEq(
            collateralAsset.balanceOf(address(vault)),
            vaultBalanceBefore,
            "Vault balance should be same as prior to request"
        );
    }

    function test_depositReverts_whenDepositNotCollected() public {
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vm.startPrank(lp1);
        vm.expectRevert("Previous deposit request is not in the same epoch");
        vault.requestDeposit(10 ether);

        vm.stopPrank();
    }

    function test_withdrawRequestReverts_whenPreviousDepositNotInCurrentEpoch()
        public
    {
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vm.startPrank(lp1);
        vm.expectRevert("Previous deposit request is not in the same epoch");
        vault.withdrawRequestDeposit(5 ether);

        vm.stopPrank();
    }

    function test_claimDeposit_whenEpochEnded() public {
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        uint256 claimable = vault.claimableDepositRequest(lp1);
        assertEq(
            claimable,
            10 ether,
            "Claimable amount should equal deposited assets"
        );

        vm.stopPrank();
    }

    function test_depositReverts_whenSameEpoch() public {
        vm.prank(lp1);
        vm.expectRevert("Deposit/Mint requires current epoch to settle");
        vault.deposit(0, lp1);
    }

    function test_depositReverts_whenNoRequestPending() public {
        vm.prank(lp2);
        vm.expectRevert("No deposit request to mint");
        vault.deposit(0, lp2);
    }

    function test_depositWorks_whenRequestPending() public {
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vm.prank(lp1);
        vault.deposit(0, lp1);

        assertEq(
            vault.balanceOf(lp1),
            10 ether,
            "Shares minted should equal 10 ether"
        );
    }

    function test_requestDepositReverts_whenRedeemPending() public {
        vm.prank(vaultOwner);
        vault.initializeFirstEpoch(initialSqrtPriceX96);

        vm.prank(lp1);
        vault.deposit(0, lp1);

        vm.prank(lp1);
        vault.requestRedeem(5 ether);

        vm.prank(lp1);
        vm.expectRevert("Cannot deposit while withdrawal is pending");
        vault.requestDeposit(10 ether);
    }
}
