// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../interfaces/IPredictionMarketEscrow.sol";
import "../../interfaces/IV2Types.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DebugV2MintSimulation
 * @notice Simulates the V2 mint call to find the exact revert reason
 *
 * Run with:
 * forge script script/DebugV2MintSimulation.s.sol --rpc-url https://rpc.etherealtest.net -vvvv
 */
contract DebugV2MintSimulation is Script {
    // Contract addresses on Ethereal testnet
    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;
    address constant WUSDE = 0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90;
    address constant PREDICTOR = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9; // SmartAccount
    address constant COUNTERPARTY = 0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B; // EOA
    address constant RESOLVER = 0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A;

    function run() external view {
        console.log("=== V2 Mint Simulation Debug ===");
        console.log("Block timestamp:", block.timestamp);

        // Check balances and allowances first
        console.log("\n--- Pre-conditions Check ---");

        uint256 predictorWusdeBalance = IERC20(WUSDE).balanceOf(PREDICTOR);
        uint256 counterpartyWusdeBalance = IERC20(WUSDE).balanceOf(COUNTERPARTY);
        uint256 predictorAllowance = IERC20(WUSDE).allowance(PREDICTOR, ESCROW);
        uint256 counterpartyAllowance =
            IERC20(WUSDE).allowance(COUNTERPARTY, ESCROW);

        console.log("Predictor wUSDe balance:", predictorWusdeBalance);
        console.log("Counterparty wUSDe balance:", counterpartyWusdeBalance);
        console.log("Predictor allowance to escrow:", predictorAllowance);
        console.log("Counterparty allowance to escrow:", counterpartyAllowance);

        // Check nonce usage (bitmap nonces — any unused nonce is valid)
        console.log(
            "Predictor nonce 0 used:",
            IPredictionMarketEscrow(ESCROW).isNonceUsed(PREDICTOR, 0)
        );
        console.log(
            "Counterparty nonce 0 used:",
            IPredictionMarketEscrow(ESCROW).isNonceUsed(COUNTERPARTY, 0)
        );

        // Values from the UserOp
        uint256 predictorCollateral = 5_100_000_000_000_000; // 0.0051 USDe
        uint256 counterpartyCollateralValue = 10_000_000_000_000_000; // 0.01 USDe
        uint256 predictorDeadline = 1_770_245_065; // 0x6983cbc9
        uint256 counterpartyDeadline = 1_770_244_820; // 0x6983cad4

        console.log("\n--- Deadline Check ---");
        console.log("Current timestamp:", block.timestamp);
        console.log("Predictor deadline:", predictorDeadline);
        console.log("Counterparty deadline:", counterpartyDeadline);

        if (block.timestamp > predictorDeadline) {
            console.log("!!! PREDICTOR DEADLINE EXPIRED !!!");
        }
        if (block.timestamp > counterpartyDeadline) {
            console.log("!!! COUNTERPARTY DEADLINE EXPIRED !!!");
        }

        // Check balance sufficiency
        console.log("\n--- Balance Sufficiency ---");
        console.log("Predictor needs:", predictorCollateral);
        console.log("Predictor has:", predictorWusdeBalance);
        if (predictorWusdeBalance < predictorCollateral) {
            console.log("!!! PREDICTOR INSUFFICIENT BALANCE !!!");
        }

        console.log("Counterparty needs:", counterpartyCollateralValue);
        console.log("Counterparty has:", counterpartyWusdeBalance);
        if (counterpartyWusdeBalance < counterpartyCollateralValue) {
            console.log("!!! COUNTERPARTY INSUFFICIENT BALANCE !!!");
        }

        // Check allowance sufficiency
        console.log("\n--- Allowance Sufficiency ---");
        if (predictorAllowance < predictorCollateral) {
            console.log("!!! PREDICTOR INSUFFICIENT ALLOWANCE !!!");
        }
        if (counterpartyAllowance < counterpartyCollateralValue) {
            console.log("!!! COUNTERPARTY INSUFFICIENT ALLOWANCE !!!");
        }

        console.log("\n=== Summary ===");
        console.log(
            "If deadlines have expired, the signature validation returns false"
        );
        console.log("which causes revert InvalidSignature()");
        console.log("But InvalidSignature has a selector, not empty reason.");
        console.log("");
        console.log(
            "If the issue is balance/allowance, safeTransferFrom would revert"
        );
        console.log("with a specific error message.");
        console.log("");
        console.log("An empty reason (0x) suggests:");
        console.log("1. ZeroDev CallPolicy validation failure");
        console.log("2. Account validation failure");
        console.log("3. Low-level call failure in account execution");
    }
}
