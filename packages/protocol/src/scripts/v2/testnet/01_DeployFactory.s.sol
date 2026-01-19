// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PositionTokenFactory} from "../../../v2/bridge/PositionTokenFactory.sol";

/// @title Deploy PositionTokenFactory
/// @notice Deploy factory on Arbitrum Sepolia
contract DeployFactory is Script {
    function run() external {
        address owner = vm.envAddress("DEPLOYER_ADDRESS");

        console.log("Deploying PositionTokenFactory...");
        console.log("Owner:", owner);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        PositionTokenFactory factory = new PositionTokenFactory(owner);

        vm.stopBroadcast();

        console.log("PositionTokenFactory deployed at:", address(factory));
        console.log("");
        console.log("Add to .env:");
        console.log("FACTORY_ADDRESS=%s", address(factory));
    }
}
