// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    PredictionMarketTokenFactory
} from "../../../v2/bridge/PredictionMarketTokenFactory.sol";

/// @title Configure PredictionMarketTokenFactory on PM Network (Mainnet)
/// @notice Add Escrow as deployer on the PM Network factory
contract ConfigureFactoryPM is Script {
    function run() external {
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        address escrowAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");

        PredictionMarketTokenFactory factory =
            PredictionMarketTokenFactory(factoryAddr);

        console.log("=== Configure Factory PM Network (Mainnet) ===");
        console.log("Factory:", factoryAddr);
        console.log("Escrow:", escrowAddr);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        factory.addDeployer(escrowAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Configured ===");
        console.log("Escrow added as factory deployer");
        console.log("Factory config complete:", factory.isConfigComplete());
    }
}
