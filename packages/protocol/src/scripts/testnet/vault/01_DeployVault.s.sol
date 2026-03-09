// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketVault
} from "../../../vault/PredictionMarketVault.sol";

/// @title Deploy PredictionMarketVault (Testnet)
/// @notice Deploys and configures PredictionMarketVault on Ethereal testnet
/// @dev Deployer becomes owner, COUNTERPARTY wallet becomes manager
contract DeployVault is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        // Manager can be set via VAULT_MANAGER env var, or falls back to COUNTERPARTY wallet
        address manager = vm.envOr(
            "VAULT_MANAGER", vm.addr(vm.envUint("COUNTERPARTY_PRIVATE_KEY"))
        );

        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");

        // Configurable vault name/symbol
        string memory name = vm.envOr("VAULT_NAME", string("Sapience Vault V2"));
        string memory symbol = vm.envOr("VAULT_SYMBOL", string("SVLT"));

        console.log("=== Deploy PredictionMarketVault (Testnet) ===");
        console.log("Deployer (owner):", deployer);
        console.log("Manager:", manager);
        console.log("Collateral Token:", collateralToken);
        console.log("Name:", name);
        console.log("Symbol:", symbol);

        vm.startBroadcast(deployerPk);

        PredictionMarketVault vault =
            new PredictionMarketVault(collateralToken, manager, name, symbol);

        // Configure interaction delays to 0 for testing (can be changed later)
        vault.setDepositInteractionDelay(0);
        vault.setWithdrawalInteractionDelay(0);

        // Configure expiration time (default 10 minutes)
        uint256 expirationTime =
            vm.envOr("VAULT_EXPIRATION_TIME", uint256(10 minutes));
        vault.setExpirationTime(expirationTime);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketVault:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("Manager:", vault.manager());
        console.log(
            "Deposit Interaction Delay:", vault.depositInteractionDelay()
        );
        console.log(
            "Withdrawal Interaction Delay:", vault.withdrawalInteractionDelay()
        );
        console.log("Expiration Time:", vault.expirationTime());
        console.log("");
        console.log("Add to .env:");
        console.log("VAULT_ADDRESS=", address(vault));
    }
}
