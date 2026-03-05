// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketVault
} from "../../../vault/PredictionMarketVault.sol";

/// @title Test Deposit and Withdrawal (Testnet)
/// @notice Tests deposit and withdrawal flow on PredictionMarketVault
/// @dev PREDICTOR deposits, COUNTERPARTY (manager) processes
contract TestDepositWithdrawal is Script {
    struct Actors {
        uint256 deployerPk;
        address deployer;
        uint256 predictorPk;
        address predictor;
        uint256 counterpartyPk;
        address counterparty;
    }

    function run() external {
        Actors memory actors = _loadActors();

        PredictionMarketVault vault =
            PredictionMarketVault(vm.envAddress("VAULT_ADDRESS"));
        IERC20 collateral = IERC20(vm.envAddress("COLLATERAL_TOKEN_ADDRESS"));

        // Configurable amounts (default 0.005 WUSDe for testnet)
        uint256 depositAmount = vm.envOr("DEPOSIT_AMOUNT", uint256(0.005 ether));
        uint256 withdrawAmount = vm.envOr("WITHDRAW_AMOUNT", depositAmount / 2);

        console.log("=== Test Deposit and Withdrawal (Testnet) ===");
        console.log("Vault:", address(vault));
        console.log("Depositor (predictor):", actors.predictor);
        console.log("Manager (counterparty):", actors.counterparty);
        console.log("Deposit Amount:", depositAmount);
        console.log("Withdraw Amount:", withdrawAmount);

        // Check initial state
        uint256 predictorCollateralBefore =
            collateral.balanceOf(actors.predictor);
        uint256 predictorSharesBefore = vault.balanceOf(actors.predictor);
        uint256 vaultBalanceBefore = collateral.balanceOf(address(vault));

        console.log("");
        console.log("=== Initial State ===");
        console.log("Predictor Collateral:", predictorCollateralBefore);
        console.log("Predictor Vault Shares:", predictorSharesBefore);
        console.log("Vault Balance:", vaultBalanceBefore);

        // Fund predictor if needed
        if (predictorCollateralBefore < depositAmount) {
            console.log("");
            console.log("=== Funding Predictor ===");
            vm.startBroadcast(actors.deployerPk);
            collateral.transfer(actors.predictor, depositAmount);
            vm.stopBroadcast();
            console.log("Funded predictor with", depositAmount);
        }

        // Phase 1: Deposit
        console.log("");
        console.log("=== Phase 1: Deposit ===");

        // Predictor approves and requests deposit
        vm.startBroadcast(actors.predictorPk);
        collateral.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopBroadcast();

        console.log("Deposit request submitted");

        // Manager processes deposit
        vm.startBroadcast(actors.counterpartyPk);
        vault.processDeposit(actors.predictor);
        vm.stopBroadcast();

        console.log("Deposit processed");

        // Verify deposit
        uint256 predictorSharesAfterDeposit = vault.balanceOf(actors.predictor);
        uint256 vaultBalanceAfterDeposit = collateral.balanceOf(address(vault));

        console.log(
            "Predictor Shares After Deposit:", predictorSharesAfterDeposit
        );
        console.log("Vault Balance After Deposit:", vaultBalanceAfterDeposit);
        require(
            predictorSharesAfterDeposit
                == predictorSharesBefore + depositAmount,
            "Incorrect shares minted"
        );
        require(
            vaultBalanceAfterDeposit == vaultBalanceBefore + depositAmount,
            "Incorrect vault balance"
        );

        // Phase 2: Withdrawal
        console.log("");
        console.log("=== Phase 2: Withdrawal ===");

        // Predictor requests withdrawal
        vm.startBroadcast(actors.predictorPk);
        vault.requestWithdrawal(withdrawAmount, withdrawAmount);
        vm.stopBroadcast();

        console.log("Withdrawal request submitted");

        // Manager processes withdrawal
        vm.startBroadcast(actors.counterpartyPk);
        vault.processWithdrawal(actors.predictor);
        vm.stopBroadcast();

        console.log("Withdrawal processed");

        // Verify withdrawal
        uint256 predictorSharesAfterWithdraw = vault.balanceOf(actors.predictor);
        uint256 predictorCollateralAfterWithdraw =
            collateral.balanceOf(actors.predictor);
        uint256 vaultBalanceAfterWithdraw = collateral.balanceOf(address(vault));

        console.log("");
        console.log("=== Final State ===");
        console.log("Predictor Shares:", predictorSharesAfterWithdraw);
        console.log("Predictor Collateral:", predictorCollateralAfterWithdraw);
        console.log("Vault Balance:", vaultBalanceAfterWithdraw);

        require(
            predictorSharesAfterWithdraw
                == predictorSharesAfterDeposit - withdrawAmount,
            "Incorrect shares burned"
        );

        console.log("");
        console.log("=== Test Passed ===");
        console.log("Deposit and withdrawal flow working correctly");
    }

    function _loadActors() internal view returns (Actors memory actors) {
        actors.deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        actors.deployer = vm.addr(actors.deployerPk);
        actors.predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        actors.predictor = vm.addr(actors.predictorPk);
        actors.counterpartyPk = vm.envUint("COUNTERPARTY_PRIVATE_KEY");
        actors.counterparty = vm.addr(actors.counterpartyPk);
    }
}
