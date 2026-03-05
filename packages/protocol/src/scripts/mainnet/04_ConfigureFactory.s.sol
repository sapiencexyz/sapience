// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketTokenFactory
} from "../../PredictionMarketTokenFactory.sol";

/// @title Configure PredictionMarketTokenFactory on PM Network (Mainnet)
/// @notice Set Escrow as deployer on the PM Network factory
contract ConfigureFactory is Script {
    function run() external {
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address escrowAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");

        PredictionMarketTokenFactory factory =
            PredictionMarketTokenFactory(factoryAddr);

        console.log("=== Configure Factory PM Network (Mainnet) ===");
        console.log("Factory:", factoryAddr);
        console.log("Escrow:", escrowAddr);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        factory.setDeployer(escrowAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Factory deployer set to escrow");
        console.log("Factory config complete:", factory.isConfigComplete());
    }
}
