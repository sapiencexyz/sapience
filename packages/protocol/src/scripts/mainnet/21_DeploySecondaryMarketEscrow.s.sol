// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { SecondaryMarketEscrow } from "../../SecondaryMarketEscrow.sol";

/// @title Deploy SecondaryMarketEscrow on PM Network (Mainnet)
/// @notice Deploys the atomic OTC swap contract on Ethereal mainnet
contract DeploySecondaryMarketEscrow is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address accountFactory = vm.envAddress("ACCOUNT_FACTORY_ADDRESS");

        console.log("=== Deploy SecondaryMarketEscrow PM Network (Mainnet) ===");
        console.log("Deployer:", deployer);
        console.log("AccountFactory:", accountFactory);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        SecondaryMarketEscrow escrow = new SecondaryMarketEscrow(accountFactory);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("SECONDARY_MARKET_ESCROW_ADDRESS=", address(escrow));
    }
}
