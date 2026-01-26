// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Script, console } from "forge-std/Script.sol";
import {
    PassiveLiquidityVaultV2
} from "../../../../v2/vault/PassiveLiquidityVaultV2.sol";

/// @title Deploy PassiveLiquidityVaultV2 (Mainnet)
/// @notice Deploys and configures PassiveLiquidityVaultV2 on Ethereal mainnet
/// @dev Deployer becomes owner, COUNTERPARTY wallet becomes manager
contract DeployVault is Script {
    function run() external {
        uint256 deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        // Manager is the COUNTERPARTY wallet (signs approvals, processes deposits/withdrawals)
        address manager = vm.addr(vm.envUint("COUNTERPARTY_PRIVATE_KEY"));

        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");

        // Configurable vault name/symbol
        string memory name = vm.envOr("VAULT_NAME", string("Sapience Vault V2"));
        string memory symbol = vm.envOr("VAULT_SYMBOL", string("SVLT"));

        console.log("=== Deploy PassiveLiquidityVaultV2 (Mainnet) ===");
        console.log("Deployer (owner):", deployer);
        console.log("Manager:", manager);
        console.log("Collateral Token:", collateralToken);
        console.log("Name:", name);
        console.log("Symbol:", symbol);

        vm.startBroadcast(deployerPk);

        PassiveLiquidityVaultV2 vault = new PassiveLiquidityVaultV2(
            collateralToken, manager, name, symbol
        );

        // Configure interaction delay to 0 for testing (can be changed later)
        vault.setInteractionDelay(0);

        // Configure expiration time (default 10 minutes)
        uint256 expirationTime =
            vm.envOr("VAULT_EXPIRATION_TIME", uint256(10 minutes));
        vault.setExpirationTime(expirationTime);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PassiveLiquidityVaultV2:", address(vault));
        console.log("Owner:", vault.owner());
        console.log("Manager:", vault.manager());
        console.log("Interaction Delay:", vault.interactionDelay());
        console.log("Expiration Time:", vault.expirationTime());
        console.log("");
        console.log("Add to .env:");
        console.log("VAULT_ADDRESS=", address(vault));
    }
}
