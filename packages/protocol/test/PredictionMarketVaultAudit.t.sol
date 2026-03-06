// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../src/vault/PredictionMarketVault.sol";
import "./mocks/MockERC20.sol";

/**
 * @title PredictionMarketVaultAudit
 * @notice Audit test for C-3: Vault withdrawal griefing via pendingWithdrawalAssets overflow
 *
 * C-3 Vulnerability:
 *   `requestWithdrawal(shares, expectedAssets)` accumulates `expectedAssets` into
 *   `pendingWithdrawalAssets` without bounding it. An attacker can pass
 *   `type(uint256).max` as expectedAssets, causing the accumulator to overflow
 *   and wrap to a small value. Subsequent `cancelWithdrawal()` calls then
 *   underflow when trying to subtract, bricking the vault.
 *
 * C-3 Fix:
 *   Remove the `pendingWithdrawalAssets` accumulator entirely — it was unused
 *   bookkeeping with no on-chain consumer. The `getPendingWithdrawals()` view
 *   now returns 0 for the assets component.
 */
contract PredictionMarketVaultAudit is Test {
    PredictionMarketVault public vault;
    MockERC20 public asset;

    address manager = makeAddr("manager");
    address owner; // deployer = test contract
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address attacker = makeAddr("attacker");

    function setUp() public {
        owner = address(this);
        asset = new MockERC20("USD Asset", "USDA", 18);
        vault = new PredictionMarketVault(
            address(asset), manager, "Vault Share", "vSHR"
        );

        // Disable interaction delays for testing
        vault.setDepositInteractionDelay(0);
        vault.setWithdrawalInteractionDelay(0);

        // Fund users
        asset.mint(alice, 1000e18);
        asset.mint(bob, 1000e18);
        asset.mint(attacker, 1000e18);

        // Approve vault
        vm.prank(alice);
        asset.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        asset.approve(address(vault), type(uint256).max);
        vm.prank(attacker);
        asset.approve(address(vault), type(uint256).max);
    }

    /// @dev Helper: deposit assets for a user (request + manager process)
    function _deposit(address user, uint256 assets, uint256 shares) internal {
        vm.prank(user);
        vault.requestDeposit(assets, shares);
        vm.prank(manager);
        vault.processDeposit(user);
    }

    /**
     * @notice C-3: expectedAssets overflow griefing attack
     *
     * UNFIXED CODE BEHAVIOR:
     *   1. Attacker deposits and gets shares
     *   2. Attacker calls requestWithdrawal(1 share, type(uint256).max)
     *   3. pendingWithdrawalAssets overflows (wraps around)
     *   4. Attacker cancels → pendingWithdrawalAssets underflow → revert or corruption
     *   5. Other users' withdrawals are permanently blocked
     *
     * FIXED CODE BEHAVIOR:
     *   pendingWithdrawalAssets accumulator is removed entirely.
     *   requestWithdrawal only tracks pendingWithdrawalShares (bounded by actual supply).
     *   The expectedAssets parameter is stored per-request but never accumulated globally.
     *   No overflow possible.
     */
    function test_C3_expectedAssetsOverflowGriefing() public {
        // Step 1: Alice deposits normally
        _deposit(alice, 100e18, 100e18);
        assertEq(vault.balanceOf(alice), 100e18, "Alice should have shares");

        // Step 2: Attacker deposits to get shares
        _deposit(attacker, 10e18, 10e18);

        // Step 3: Attacker requests withdrawal with type(uint256).max expectedAssets
        // VULN: On unfixed code, this would overflow pendingWithdrawalAssets
        // On fixed code, pendingWithdrawalAssets doesn't exist, so no overflow
        vm.prank(attacker);
        vault.requestWithdrawal(1e18, type(uint256).max);

        // Step 4: Verify the vault is still functional
        uint256 pendingShares = vault.getPendingWithdrawals();
        console.log("Pending shares:", pendingShares);

        // Step 5: Let the request expire so attacker can cancel
        // expirationTime defaults to 10 minutes
        vm.warp(block.timestamp + 11 minutes);

        vm.prank(attacker);
        vault.cancelWithdrawal();
        // VULN: On unfixed code, cancelWithdrawal tries pendingWithdrawalAssets -= type(uint256).max
        // which would underflow and revert, permanently blocking the attacker's cancel
        // and leaving the corrupted accumulator in place

        // Step 6: Verify Alice can still withdraw normally
        // Skip interaction delay
        vm.warp(block.timestamp + 2 days);

        vm.prank(alice);
        vault.requestWithdrawal(50e18, 50e18);

        vm.prank(manager);
        vault.processWithdrawal(alice);

        assertEq(
            vault.balanceOf(alice), 50e18, "Alice should have withdrawn half"
        );
        assertEq(
            asset.balanceOf(alice),
            1000e18 - 100e18 + 50e18,
            "Alice should have received assets back"
        );

        console.log(
            "C-3 FIX VERIFIED: Vault remains functional after griefing attempt"
        );
    }
}
