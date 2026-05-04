// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { SecondaryMarketEscrow } from "../../SecondaryMarketEscrow.sol";

/// @title Deploy SecondaryMarketEscrow on PM Network
/// @notice Deploys the atomic OTC swap contract.
/// @dev The constructor no longer takes an account factory — the legacy
///      session-key path was removed in favour of ERC-1271 validation.
contract DeploySecondaryMarketEscrow is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");

        console.log("=== Deploy SecondaryMarketEscrow PM Network ===");
        console.log("Deployer:", deployer);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        SecondaryMarketEscrow escrow = new SecondaryMarketEscrow();

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("SECONDARY_MARKET_ESCROW_ADDRESS=", address(escrow));
    }
}
