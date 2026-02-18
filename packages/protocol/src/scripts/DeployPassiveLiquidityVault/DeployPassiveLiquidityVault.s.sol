// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PassiveLiquidityVault} from "../../vault/PassiveLiquidityVault.sol";

/// @title Deploy PassiveLiquidityVault to Arbitrum One
/// @notice Deploys the PassiveLiquidityVault contract with specified parameters
contract DeployPassiveLiquidityVault is Script {
    function run() external {
        // Contract parameters
        address asset = 0xfEb8C4d5eFbaFf6e928eA090Bc660c363f883DBA;
        address manager = 0x759dD186D243Ddec7901D46D7Ed94a3b1bC8b948;
        string memory name = "Sapience LP";
        string memory symbol = "sapLP";

        // Deploy the contract
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        
        PassiveLiquidityVault vault = new PassiveLiquidityVault(
            asset,
            manager,
            name,
            symbol
        );
        
        vm.stopBroadcast();

        // Log deployment info
        console.log("===========================================");
        console.log("PassiveLiquidityVault deployed successfully!");
        console.log("===========================================");
        console.log("Contract Address:", address(vault));
        console.log("Asset:", asset);
        console.log("Manager:", manager);
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("===========================================");
    }
}

