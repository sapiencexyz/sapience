// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {MarketLayerZeroBridge} from "../bridge/MarketLayerZeroBridge.sol";

// Market is on Base
contract DeployMarketLZBridge is Script {
    function run() external {
        // Replace these env vars with your own values
        address endpoint = 0x1a44076050125825900e736c501f859c50fE728c;
        address owner = 0xdb5Af497A73620d881561eDb508012A5f84e9BA2;

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        MarketLayerZeroBridge market = new MarketLayerZeroBridge(endpoint, owner);
        vm.stopBroadcast();

        console.log("MarketLayerZeroBridge deployed to:", address(market));
    }
}
