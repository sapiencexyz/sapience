// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import {
    PredictionMarketVault
} from "../../src/vault/PredictionMarketVault.sol";
import {
    IPredictionMarketVault
} from "../../src/vault/interfaces/IPredictionMarketVault.sol";
import { MockERC20 } from "../mocks/MockERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PredictionMarketVaultTest is Test {
    PredictionMarketVault public vault;
    MockERC20 public asset;

    address public owner = address(0x1);
    address public manager = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);
    address public user3 = address(0x5);
    address public protocol1 = address(0x10);
    address public protocol2 = address(0x11);

    uint256 public constant INITIAL_SUPPLY = 1_000_000e18;
    uint256 public constant DEPOSIT_AMOUNT = 100_000e18;

    function setUp() public {
        vm.startPrank(owner);

        // Deploy mock asset token
        asset = new MockERC20("Test Token", "TEST", 18);

        // Deploy vault
        vault = new PredictionMarketVault(
            address(asset), manager, "Passive Liquidity Vault V2", "PLV2"
        );

        // Mint tokens to users
        asset.mint(user1, INITIAL_SUPPLY);
        asset.mint(user2, INITIAL_SUPPLY);
        asset.mint(user3, INITIAL_SUPPLY);

        // Set interaction delays to 0 for testing
        vault.setDepositInteractionDelay(0);
        vault.setWithdrawalInteractionDelay(0);

        vm.stopPrank();
    }

    // ============ Helper Functions ============

    function _approveAndDeposit(address user, uint256 amount)
        internal
        returns (uint256 shares)
    {
        vm.startPrank(user);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount); // 1:1 ratio initially
        vm.stopPrank();

        // Process the deposit to mint shares immediately
        vm.startPrank(manager);
        vault.processDeposit(user);
        vm.stopPrank();

        // Return the actual shares minted
        shares = vault.balanceOf(user);
    }

    // ============ Constructor Tests ============

    function test_constructorSetsCorrectValues() public view {
        assertEq(vault.asset(), address(asset));
        assertEq(vault.manager(), manager);
        assertEq(vault.decimals(), 18);
        assertEq(vault.name(), "Passive Liquidity Vault V2");
        assertEq(vault.symbol(), "PLV2");
        assertFalse(vault.emergencyMode());
    }

    function test_constructorRevertsWithZeroAsset() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidAsset.selector, address(0)
            )
        );
        new PredictionMarketVault(address(0), manager, "Test Vault", "TV");
    }

    function test_constructorRevertsWithZeroManager() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidManager.selector, address(0)
            )
        );
        new PredictionMarketVault(
            address(asset), address(0), "Test Vault", "TV"
        );
    }

    // ============ Request-based Deposit Tests ============

    function test_requestDeposit() public {
        uint256 amount = DEPOSIT_AMOUNT;

        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);
        vm.stopPrank();

        // Check pending request exists
        (
            uint256 shares,
            uint256 assets,,
            address requestUser,
            bool isDeposit,
            bool processed
        ) = vault.pendingRequests(user1);

        assertEq(requestUser, user1);
        assertEq(assets, amount);
        assertEq(shares, amount);
        assertTrue(isDeposit);
        assertFalse(processed);
    }

    function test_requestDepositRevertsWithZeroAssets() public {
        vm.startPrank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidAmount.selector, 0
            )
        );
        vault.requestDeposit(0, 100);
        vm.stopPrank();
    }

    function test_requestDepositRevertsWithZeroShares() public {
        vm.startPrank(user1);
        asset.approve(address(vault), 100);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidShares.selector, 0
            )
        );
        vault.requestDeposit(100, 0);
        vm.stopPrank();
    }

    function test_processDeposit() public {
        uint256 amount = DEPOSIT_AMOUNT;

        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);
        vm.stopPrank();

        vm.startPrank(manager);
        vault.processDeposit(user1);
        vm.stopPrank();

        assertEq(vault.balanceOf(user1), amount);
        assertEq(asset.balanceOf(address(vault)), amount);
        assertEq(vault.availableAssets(), amount);
    }

    function test_processDepositRevertsWhenExpired() public {
        uint256 amount = DEPOSIT_AMOUNT;

        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);
        vm.stopPrank();

        // Wait for expiration
        vm.warp(block.timestamp + 11 minutes);

        vm.startPrank(manager);
        vm.expectRevert(PredictionMarketVault.RequestExpired.selector);
        vault.processDeposit(user1);
        vm.stopPrank();
    }

    function test_cancelDeposit() public {
        uint256 amount = DEPOSIT_AMOUNT;
        uint256 balanceBefore = asset.balanceOf(user1);

        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);
        vm.stopPrank();

        // Wait for expiration
        vm.warp(block.timestamp + 11 minutes);

        vm.startPrank(user1);
        vault.cancelDeposit();
        vm.stopPrank();

        // Assets should be returned
        assertEq(asset.balanceOf(user1), balanceBefore);
    }

    function test_cancelDepositRevertsBeforeExpiration() public {
        uint256 amount = DEPOSIT_AMOUNT;

        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount);

        vm.expectRevert(PredictionMarketVault.RequestNotExpired.selector);
        vault.cancelDeposit();
        vm.stopPrank();
    }

    // ============ Request-based Withdrawal Tests ============

    function test_requestWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();

        // Check pending request exists
        (
            uint256 requestShares,
            uint256 requestAssets,,
            address requestUser,
            bool isDeposit,
            bool processed
        ) = vault.pendingRequests(user1);

        assertEq(requestUser, user1);
        assertEq(requestShares, shares);
        assertEq(requestAssets, depositAmount);
        assertFalse(isDeposit);
        assertFalse(processed);
    }

    function test_requestWithdrawalRevertsWithZeroShares() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.startPrank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidShares.selector, 0
            )
        );
        vault.requestWithdrawal(0, 100);
        vm.stopPrank();
    }

    function test_requestWithdrawalRevertsWithInsufficientBalance() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.startPrank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InsufficientBalance.selector,
                user1,
                shares + 1,
                shares
            )
        );
        vault.requestWithdrawal(shares + 1, depositAmount);
        vm.stopPrank();
    }

    function test_processWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();

        uint256 balanceBefore = asset.balanceOf(user1);

        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vm.stopPrank();

        assertEq(vault.balanceOf(user1), 0);
        assertEq(asset.balanceOf(user1), balanceBefore + depositAmount);
    }

    function test_processWithdrawalRevertsWhenExpired() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();

        // Wait for expiration
        vm.warp(block.timestamp + 11 minutes);

        vm.startPrank(manager);
        vm.expectRevert(PredictionMarketVault.RequestExpired.selector);
        vault.processWithdrawal(user1);
        vm.stopPrank();
    }

    function test_cancelWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();

        // Wait for expiration
        vm.warp(block.timestamp + 11 minutes);

        vm.startPrank(user1);
        vault.cancelWithdrawal();
        vm.stopPrank();

        // Shares should still be there
        assertEq(vault.balanceOf(user1), shares);
    }

    // ============ Batch Processing Tests ============

    function test_batchProcessDeposit() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;

        // Three users request deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        vm.startPrank(user2);
        asset.approve(address(vault), depositAmount * 2);
        vault.requestDeposit(depositAmount * 2, depositAmount * 2);
        vm.stopPrank();

        vm.warp(block.timestamp + 1);
        vm.startPrank(user3);
        asset.approve(address(vault), depositAmount * 3);
        vault.requestDeposit(depositAmount * 3, depositAmount * 3);
        vm.stopPrank();

        // Manager batch processes all deposits
        address[] memory requesters = new address[](3);
        requesters[0] = user1;
        requesters[1] = user2;
        requesters[2] = user3;

        vm.prank(manager);
        vault.batchProcessDeposit(requesters);

        // Verify all deposits were processed
        assertEq(vault.balanceOf(user1), depositAmount);
        assertEq(vault.balanceOf(user2), depositAmount * 2);
        assertEq(vault.balanceOf(user3), depositAmount * 3);
    }

    function test_batchProcessWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;

        // Setup: users deposit first
        _approveAndDeposit(user1, depositAmount);
        vm.warp(block.timestamp + 1 days + 1);
        _approveAndDeposit(user2, depositAmount * 2);
        vm.warp(block.timestamp + 1 days + 1);
        _approveAndDeposit(user3, depositAmount * 3);

        // Users request withdrawals
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(depositAmount, depositAmount);

        vm.warp(block.timestamp + 1);
        vm.prank(user2);
        vault.requestWithdrawal(depositAmount * 2, depositAmount * 2);

        vm.warp(block.timestamp + 1);
        vm.prank(user3);
        vault.requestWithdrawal(depositAmount * 3, depositAmount * 3);

        // Manager batch processes all withdrawals
        address[] memory requesters = new address[](3);
        requesters[0] = user1;
        requesters[1] = user2;
        requesters[2] = user3;

        vm.prank(manager);
        vault.batchProcessWithdrawal(requesters);

        // Verify all withdrawals were processed
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), 0);
        assertEq(vault.balanceOf(user3), 0);
    }

    // ============ Emergency Mode Tests ============

    function test_emergencyWithdraw() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        // Enable emergency mode
        vm.prank(owner);
        vault.toggleEmergencyMode();

        // Emergency withdraw
        vm.prank(user1);
        vault.emergencyWithdraw(shares);

        assertEq(asset.balanceOf(user1), INITIAL_SUPPLY);
        assertEq(vault.balanceOf(user1), 0);
    }

    function test_emergencyWithdrawRevertsWhenNotInEmergencyMode() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.prank(user1);
        vm.expectRevert(PredictionMarketVault.EmergencyModeNotActive.selector);
        vault.emergencyWithdraw(shares);
    }

    function test_emergencyWithdrawExcludesUnconfirmedAssets() public {
        // User1 deposits and gets confirmed shares
        uint256 user1DepositAmount = 1000e18;
        _approveAndDeposit(user1, user1DepositAmount);

        uint256 user1Shares = vault.balanceOf(user1);

        // User2 requests a deposit (assets transferred but shares not minted yet)
        uint256 user2DepositAmount = 500e18;
        vm.startPrank(user2);
        asset.approve(address(vault), user2DepositAmount);
        vault.requestDeposit(user2DepositAmount, user2DepositAmount);
        vm.stopPrank();

        // Enable emergency mode
        vm.prank(owner);
        vault.toggleEmergencyMode();

        // User1 does emergency withdrawal of all their shares
        uint256 user1BalanceBefore = asset.balanceOf(user1);

        vm.prank(user1);
        vault.emergencyWithdraw(user1Shares);

        uint256 user1Received = asset.balanceOf(user1) - user1BalanceBefore;

        // User1 should receive approximately their original deposit
        // NOT the full vault balance including unconfirmed assets
        assertApproxEqAbs(user1Received, user1DepositAmount, 1e18);

        // User2's deposit should still be in the vault (protected)
        uint256 vaultBalanceAfter = asset.balanceOf(address(vault));
        assertApproxEqAbs(vaultBalanceAfter, user2DepositAmount, 1e18);
    }

    function test_requestsBlockedInEmergencyMode() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(owner);
        vault.toggleEmergencyMode();

        vm.startPrank(user2);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vm.expectRevert(PredictionMarketVault.EmergencyModeActive.selector);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    // ============ Manager Functions Tests ============

    function test_approveFundsUsage() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);

        uint256 approvalAmount = DEPOSIT_AMOUNT;

        vm.prank(manager);
        vault.approveFundsUsage(protocol1, approvalAmount);

        assertEq(asset.allowance(address(vault), protocol1), approvalAmount);
    }

    function test_approveFundsUsageRevertsWithZeroProtocol() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidProtocol.selector, address(0)
            )
        );
        vault.approveFundsUsage(address(0), DEPOSIT_AMOUNT);
    }

    function test_approveFundsUsageRevertsWithZeroAmount() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidAmount.selector, 0
            )
        );
        vault.approveFundsUsage(protocol1, 0);
    }

    function test_approveFundsUsageRevertsWhenExceedsAvailable() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);

        uint256 excessAmount = depositAmount + 1;

        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InsufficientAvailableAssets.selector,
                excessAmount,
                depositAmount
            )
        );
        vault.approveFundsUsage(protocol1, excessAmount);
    }

    function test_approveFundsUsageReplacesExistingApproval() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);

        // First approval
        vm.prank(manager);
        vault.approveFundsUsage(protocol1, DEPOSIT_AMOUNT);
        assertEq(asset.allowance(address(vault), protocol1), DEPOSIT_AMOUNT);

        // Second approval replaces the first
        vm.prank(manager);
        vault.approveFundsUsage(protocol1, DEPOSIT_AMOUNT / 2);
        assertEq(asset.allowance(address(vault), protocol1), DEPOSIT_AMOUNT / 2);
    }

    function test_approveFundsUsageEmitsEvent() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);

        vm.prank(manager);
        vm.expectEmit(true, true, true, true);
        emit IPredictionMarketVault.FundsApproved(
            manager, DEPOSIT_AMOUNT, protocol1
        );
        vault.approveFundsUsage(protocol1, DEPOSIT_AMOUNT);
    }

    // ============ Admin Functions Tests ============

    function test_setManager() public {
        address newManager = address(0x6);

        vm.prank(owner);
        vault.setManager(newManager);

        assertEq(vault.manager(), newManager);
    }

    function test_setManagerRevertsWithZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.InvalidManager.selector, address(0)
            )
        );
        vault.setManager(address(0));
    }

    function test_setManagerEmitsEvent() public {
        address newManager = address(0x6);

        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IPredictionMarketVault.ManagerUpdated(manager, newManager);
        vault.setManager(newManager);
    }

    function test_setDepositInteractionDelay() public {
        uint256 newDelay = 2 days;

        vm.prank(owner);
        vault.setDepositInteractionDelay(newDelay);

        assertEq(vault.depositInteractionDelay(), newDelay);
    }

    function test_setWithdrawalInteractionDelay() public {
        uint256 newDelay = 12 hours;

        vm.prank(owner);
        vault.setWithdrawalInteractionDelay(newDelay);

        assertEq(vault.withdrawalInteractionDelay(), newDelay);
    }

    function test_setExpirationTime() public {
        uint256 newExpiration = 15 minutes;

        vm.prank(owner);
        vault.setExpirationTime(newExpiration);

        assertEq(vault.expirationTime(), newExpiration);
    }

    function test_toggleEmergencyMode() public {
        assertFalse(vault.emergencyMode());

        vm.prank(owner);
        vault.toggleEmergencyMode();
        assertTrue(vault.emergencyMode());

        vm.prank(owner);
        vault.toggleEmergencyMode();
        assertFalse(vault.emergencyMode());
    }

    function test_toggleEmergencyModeEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, true, true, true);
        emit IPredictionMarketVault.EmergencyModeUpdated(true);
        vault.toggleEmergencyMode();
    }

    function test_pause() public {
        vm.prank(owner);
        vault.pause();

        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vm.expectRevert();
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    function test_unpause() public {
        vm.prank(owner);
        vault.pause();

        vm.prank(owner);
        vault.unpause();

        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    // ============ Access Control Tests ============

    function test_onlyManagerCanProcessDeposit() public {
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();

        vm.prank(user2);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.OnlyManager.selector, user2, manager
            )
        );
        vault.processDeposit(user1);
    }

    function test_onlyManagerCanProcessWithdrawal() public {
        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vault.requestWithdrawal(shares, DEPOSIT_AMOUNT);

        vm.prank(user2);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.OnlyManager.selector, user2, manager
            )
        );
        vault.processWithdrawal(user1);
    }

    function test_onlyManagerCanApproveFundsUsage() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.OnlyManager.selector, user1, manager
            )
        );
        vault.approveFundsUsage(protocol1, DEPOSIT_AMOUNT / 2);
    }

    function test_onlyOwnerCanSetManager() public {
        vm.prank(user1);
        vm.expectRevert();
        vault.setManager(address(0x6));
    }

    function test_onlyOwnerCanToggleEmergencyMode() public {
        vm.prank(user1);
        vm.expectRevert();
        vault.toggleEmergencyMode();
    }

    // ============ Share Transfer Restriction Tests ============

    function test_transferBlockedWhenSharesLockedForWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.prank(user1);
        vault.requestWithdrawal(shares, depositAmount);

        assertEq(vault.getLockedShares(user1), shares);
        assertEq(vault.getAvailableShares(user1), 0);

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.SharesLockedForWithdrawal.selector,
                user1,
                shares,
                shares
            )
        );
        vault.transfer(user2, shares);
    }

    function test_partialTransferAllowedWithSufficientUnlockedShares() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        // Lock half the shares
        uint256 withdrawalShares = shares / 2;
        vm.prank(user1);
        vault.requestWithdrawal(withdrawalShares, depositAmount / 2);

        assertEq(vault.getLockedShares(user1), withdrawalShares);
        assertEq(vault.getAvailableShares(user1), shares - withdrawalShares);

        // Can transfer unlocked shares
        vm.prank(user1);
        vault.transfer(user2, shares - withdrawalShares);

        assertEq(vault.balanceOf(user1), withdrawalShares);
        assertEq(vault.balanceOf(user2), shares - withdrawalShares);
    }

    function test_transferAllowedAfterWithdrawalCancelled() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        vm.prank(user1);
        vault.requestWithdrawal(shares, depositAmount);

        // Wait for expiration and cancel
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(user1);
        vault.cancelWithdrawal();

        assertEq(vault.getLockedShares(user1), 0);
        assertEq(vault.getAvailableShares(user1), shares);

        // Transfer should succeed
        vm.prank(user1);
        vault.transfer(user2, shares);

        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), shares);
    }

    function test_noTransferRestrictionForDepositRequests() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);

        // Make another deposit request
        vm.warp(block.timestamp + 1 days + 1);
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();

        // No shares locked for deposit requests
        assertEq(vault.getLockedShares(user1), 0);

        // Transfer should succeed
        vm.prank(user1);
        vault.transfer(user2, shares);

        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), shares);
    }

    // ============ Interaction Delay Tests ============

    function test_depositInteractionDelayEnforced() public {
        vm.prank(owner);
        vault.setDepositInteractionDelay(1 hours);

        // First deposit
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT * 2);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();

        vm.prank(manager);
        vault.processDeposit(user1);

        // Try to make another request immediately
        vm.prank(user1);
        vm.expectRevert(
            PredictionMarketVault.InteractionDelayNotExpired.selector
        );
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);

        // Wait for delay
        vm.warp(block.timestamp + 1 hours + 1);

        // Now it should work
        vm.prank(user1);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
    }

    function test_withdrawalInteractionDelayEnforced() public {
        vm.prank(owner);
        vault.setWithdrawalInteractionDelay(1 hours);

        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        // Wait past withdrawal delay (deposit set the shared timestamp)
        vm.warp(block.timestamp + 1 hours + 1);

        // Request withdrawal
        vm.prank(user1);
        vault.requestWithdrawal(shares / 2, DEPOSIT_AMOUNT / 2);

        vm.prank(manager);
        vault.processWithdrawal(user1);

        // Try another withdrawal immediately
        vm.prank(user1);
        vm.expectRevert(
            PredictionMarketVault.InteractionDelayNotExpired.selector
        );
        vault.requestWithdrawal(shares / 2, DEPOSIT_AMOUNT / 2);

        // Wait for delay
        vm.warp(block.timestamp + 1 hours + 1);

        // Now it should work
        vm.prank(user1);
        vault.requestWithdrawal(shares / 2, DEPOSIT_AMOUNT / 2);
    }

    function test_splitDelaysAreIndependent() public {
        vm.startPrank(owner);
        vault.setDepositInteractionDelay(2 hours);
        vault.setWithdrawalInteractionDelay(30 minutes);
        vm.stopPrank();

        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        // Wait past the withdrawal delay (deposit set the shared timestamp)
        vm.warp(block.timestamp + 31 minutes);

        // Withdrawal should work (only 30 min withdrawal delay from last action)
        vm.prank(user1);
        vault.requestWithdrawal(shares / 2, DEPOSIT_AMOUNT / 2);

        vm.prank(manager);
        vault.processWithdrawal(user1);

        // After another 31 min: withdrawal delay passed but deposit delay not
        vm.warp(block.timestamp + 31 minutes);

        // Withdrawal should work again
        vm.prank(user1);
        vault.requestWithdrawal(shares / 4, DEPOSIT_AMOUNT / 4);

        vm.prank(manager);
        vault.processWithdrawal(user1);

        // Deposit should still be blocked (need 2 hours from last action)
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vm.expectRevert(
            PredictionMarketVault.InteractionDelayNotExpired.selector
        );
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Wait for full deposit delay
        vm.warp(block.timestamp + 2 hours);

        // Now deposit should work
        vm.startPrank(user1);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    function test_depositInteractionDelayResetAfterCancel() public {
        vm.prank(owner);
        vault.setDepositInteractionDelay(1 hours);

        // Make a deposit request
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT * 2);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Wait for expiration and cancel
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(user1);
        vault.cancelDeposit();

        // Should be able to make a new request immediately
        vm.prank(user1);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
    }

    function test_withdrawalInteractionDelayResetAfterCancel() public {
        vm.prank(owner);
        vault.setWithdrawalInteractionDelay(1 hours);

        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        // Wait past withdrawal delay (deposit set the shared timestamp)
        vm.warp(block.timestamp + 1 hours + 1);

        // Make a withdrawal request
        vm.prank(user1);
        vault.requestWithdrawal(shares, DEPOSIT_AMOUNT);

        // Wait for expiration and cancel
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(user1);
        vault.cancelWithdrawal();

        // Should be able to make a new request immediately (cancel resets timestamp)
        vm.prank(user1);
        vault.requestWithdrawal(shares, DEPOSIT_AMOUNT);
    }

    // ============ Pending Withdrawals Accumulator Tests ============

    function test_getPendingWithdrawals_zeroByDefault() public view {
        uint256 shares = vault.getPendingWithdrawals();
        assertEq(shares, 0);
    }

    function test_getPendingWithdrawals_incrementsOnRequest() public {
        uint256 depositShares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vault.requestWithdrawal(depositShares, DEPOSIT_AMOUNT);

        uint256 shares = vault.getPendingWithdrawals();
        assertEq(shares, depositShares);
    }

    function test_getPendingWithdrawals_decrementsOnProcess() public {
        uint256 depositShares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vault.requestWithdrawal(depositShares, DEPOSIT_AMOUNT);

        vm.prank(manager);
        vault.processWithdrawal(user1);

        uint256 shares = vault.getPendingWithdrawals();
        assertEq(shares, 0);
    }

    function test_getPendingWithdrawals_decrementsOnCancel() public {
        uint256 depositShares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vault.requestWithdrawal(depositShares, DEPOSIT_AMOUNT);

        // Wait for expiration and cancel
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(user1);
        vault.cancelWithdrawal();

        uint256 shares = vault.getPendingWithdrawals();
        assertEq(shares, 0);
    }

    function test_getPendingWithdrawals_multipleUsers() public {
        uint256 shares1 = _approveAndDeposit(user1, DEPOSIT_AMOUNT);
        uint256 shares2 = _approveAndDeposit(user2, DEPOSIT_AMOUNT * 2);

        vm.prank(user1);
        vault.requestWithdrawal(shares1, DEPOSIT_AMOUNT);

        vm.prank(user2);
        vault.requestWithdrawal(shares2, DEPOSIT_AMOUNT * 2);

        uint256 shares = vault.getPendingWithdrawals();
        assertEq(shares, shares1 + shares2);

        // Process one
        vm.prank(manager);
        vault.processWithdrawal(user1);

        shares = vault.getPendingWithdrawals();
        assertEq(shares, shares2);
    }

    // ============ ERC1271 Signature Tests ============

    function test_isValidSignatureWithValidManagerSignature() public {
        bytes32 messageHash = keccak256("test message");

        // Get the expected typed data hash
        bytes32 typedDataHash = vault.getApprovalHash(messageHash, manager);

        // Sign with manager's private key (0x2 is the address, we need a proper key)
        uint256 managerPrivateKey = 0x12345;
        address managerAddr = vm.addr(managerPrivateKey);

        // Update manager to use the new address
        vm.prank(owner);
        vault.setManager(managerAddr);

        // Get the new typed data hash for the new manager
        typedDataHash = vault.getApprovalHash(messageHash, managerAddr);

        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(managerPrivateKey, typedDataHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bytes4 result = vault.isValidSignature(messageHash, signature);
        assertEq(result, bytes4(0x1626ba7e)); // IERC1271.isValidSignature.selector
    }

    function test_isValidSignatureWithInvalidSignature() public {
        bytes32 messageHash = keccak256("test message");

        // Sign with wrong key
        uint256 wrongPrivateKey = 0x99999;
        bytes32 typedDataHash = vault.getApprovalHash(messageHash, manager);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(wrongPrivateKey, typedDataHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        bytes4 result = vault.isValidSignature(messageHash, signature);
        assertEq(result, bytes4(0xFFFFFFFF));
    }

    // ============ View Functions Tests ============

    function test_availableAssets() public {
        assertEq(vault.availableAssets(), 0);

        _approveAndDeposit(user1, DEPOSIT_AMOUNT);
        assertEq(vault.availableAssets(), DEPOSIT_AMOUNT);

        _approveAndDeposit(user2, DEPOSIT_AMOUNT * 2);
        assertEq(vault.availableAssets(), DEPOSIT_AMOUNT * 3);
    }

    function test_availableAssetsExcludesUnconfirmed() public {
        _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        // User2 requests deposit but not processed
        vm.startPrank(user2);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();

        // Available should only include confirmed deposits
        assertEq(vault.availableAssets(), DEPOSIT_AMOUNT);
    }

    function test_getLockedShares() public {
        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        assertEq(vault.getLockedShares(user1), 0);

        vm.prank(user1);
        vault.requestWithdrawal(shares, DEPOSIT_AMOUNT);

        assertEq(vault.getLockedShares(user1), shares);
    }

    function test_getAvailableShares() public {
        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        assertEq(vault.getAvailableShares(user1), shares);

        vm.prank(user1);
        vault.requestWithdrawal(shares / 2, DEPOSIT_AMOUNT / 2);

        assertEq(vault.getAvailableShares(user1), shares / 2);
    }

    // ============ ERC165 Interface Detection Tests ============

    function test_supportsInterface() public view {
        // IPredictionMarketVault
        assertTrue(
            vault.supportsInterface(type(IPredictionMarketVault).interfaceId)
        );

        // IERC1271
        assertTrue(vault.supportsInterface(0x1626ba7e));

        // ERC165
        assertTrue(vault.supportsInterface(0x01ffc9a7));

        // Random interface should return false
        assertFalse(vault.supportsInterface(0x12345678));
    }

    // ============ Multiple Users Tests ============

    function test_multipleUsersDepositAndWithdraw() public {
        uint256 amount1 = DEPOSIT_AMOUNT;
        uint256 amount2 = DEPOSIT_AMOUNT * 2;
        uint256 amount3 = DEPOSIT_AMOUNT * 3;

        uint256 shares1 = _approveAndDeposit(user1, amount1);
        uint256 shares2 = _approveAndDeposit(user2, amount2);
        uint256 shares3 = _approveAndDeposit(user3, amount3);

        assertEq(vault.totalSupply(), shares1 + shares2 + shares3);
        assertEq(vault.availableAssets(), amount1 + amount2 + amount3);

        // All users request withdrawals
        vm.prank(user1);
        vault.requestWithdrawal(shares1, amount1);
        vm.prank(user2);
        vault.requestWithdrawal(shares2, amount2);
        vm.prank(user3);
        vault.requestWithdrawal(shares3, amount3);

        // Process all withdrawals
        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vault.processWithdrawal(user2);
        vault.processWithdrawal(user3);
        vm.stopPrank();

        assertEq(vault.totalSupply(), 0);
        assertEq(vault.availableAssets(), 0);
        assertEq(asset.balanceOf(user1), INITIAL_SUPPLY);
        assertEq(asset.balanceOf(user2), INITIAL_SUPPLY);
        assertEq(asset.balanceOf(user3), INITIAL_SUPPLY);
    }

    // ============ Pending Request Edge Cases ============

    function test_cannotHaveMultiplePendingRequests() public {
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT * 2);
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);

        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.PendingRequestNotProcessed.selector, user1
            )
        );
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        vm.stopPrank();
    }

    function test_processNonExistentRequestReverts() public {
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.NoPendingRequests.selector, user1
            )
        );
        vault.processDeposit(user1);
    }

    function test_processWrongRequestTypeReverts() public {
        uint256 shares = _approveAndDeposit(user1, DEPOSIT_AMOUNT);

        vm.prank(user1);
        vault.requestWithdrawal(shares, DEPOSIT_AMOUNT);

        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PredictionMarketVault.NoPendingDeposit.selector, user1
            )
        );
        vault.processDeposit(user1);
    }
}
