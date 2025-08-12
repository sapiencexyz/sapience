// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {UMALayerZeroBridge} from "../bridge/UMALayerZeroBridge.sol";

// Deploy this contract on Base (where UMA is deployed)
contract DeployUMALZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c; // Arbitrum One and Base endpoints are the same
        address owner = 0xdb5Af497A73620d881561eDb508012A5f84e9BA2; // Deployer

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        UMALayerZeroBridge uma = new UMALayerZeroBridge(endpoint, owner, 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8, 500000000); // 500 USDC);
        vm.stopBroadcast();

        console.log("UMALayerZeroBridge deployed to:", address(uma));
    }
}
