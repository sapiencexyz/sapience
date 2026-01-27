// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketTokenFactory
} from "../../../v2/bridge/PredictionMarketTokenFactory.sol";

/// @title Deploy PredictionMarketTokenFactory
/// @notice Deploy factory on SM Network Sepolia (remote chain)
contract DeployFactory is Script {
    function run() external {
        address owner = vm.envAddress("DEPLOYER_ADDRESS");

        console.log("=== Deploy PredictionMarketTokenFactory ===");
        console.log("Owner:", owner);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        PredictionMarketTokenFactory factory = new PredictionMarketTokenFactory(owner);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketTokenFactory:", address(factory));
        console.log("");
        console.log("Add to .env:");
        console.log("FACTORY_ADDRESS=", address(factory));
    }
}
