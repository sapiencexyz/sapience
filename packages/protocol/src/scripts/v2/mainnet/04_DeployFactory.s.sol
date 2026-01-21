// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PositionTokenFactory
} from "../../../v2/bridge/PositionTokenFactory.sol";

/// @title Deploy PositionTokenFactory (Mainnet)
/// @notice Deploy factory on SM Network (Arbitrum mainnet - remote chain)
contract DeployFactory is Script {
    function run() external {
        address owner = vm.envAddress("SM_NETWORK_DEPLOYER_ADDRESS");

        console.log("=== Deploy PositionTokenFactory (Mainnet) ===");
        console.log("Owner:", owner);

        vm.startBroadcast(vm.envUint("SM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PositionTokenFactory factory = new PositionTokenFactory(owner);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PositionTokenFactory:", address(factory));
        console.log("");
        console.log("Add to .env:");
        console.log("FACTORY_ADDRESS=", address(factory));
    }
}
