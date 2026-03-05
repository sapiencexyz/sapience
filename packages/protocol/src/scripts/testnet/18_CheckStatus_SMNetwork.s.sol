// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";
import {
    PredictionMarketTokenFactory
} from "../../PredictionMarketTokenFactory.sol";
import {
    IPredictionMarketBridgeBase
} from "../../bridge/interfaces/IPredictionMarketBridgeBase.sol";

/// @title Check Status - SM Network
/// @notice Check deployment status on SM Network (Secondary Market)
contract CheckStatus_SMNetwork is Script {
    function run() external view {
        console.log("=== SM Network Status Check ===");
        console.log("");

        address deployer = vm.envAddress("SM_NETWORK_DEPLOYER_ADDRESS");
        console.log("Deployer:", deployer);

        // Check SM Network Bridge
        address bridgeAddr = vm.envOr("SM_NETWORK_BRIDGE_ADDRESS", address(0));
        if (bridgeAddr != address(0)) {
            console.log("");
            console.log("--- SM Network Bridge ---");
            console.log("Address:", bridgeAddr);
            PredictionMarketBridgeRemote bridge =
                PredictionMarketBridgeRemote(payable(bridgeAddr));
            console.log("Owner:", bridge.owner());
            console.log("ETH Balance:", bridge.getETHBalance());
            console.log("Factory:", bridge.getFactory());
            console.log("Config Complete:", bridge.isConfigComplete());
            IPredictionMarketBridgeBase.BridgeConfig memory config =
                bridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("Remote Bridge:", config.remoteBridge);
        }

        // Check Factory
        address factoryAddr = vm.envOr("FACTORY_ADDRESS", address(0));
        if (factoryAddr != address(0)) {
            console.log("");
            console.log("--- Position Token Factory ---");
            console.log("Address:", factoryAddr);
            PredictionMarketTokenFactory factory =
                PredictionMarketTokenFactory(factoryAddr);
            console.log("Owner:", factory.owner());
            console.log("Deployer:", factory.deployer());
            console.log("Config Complete:", factory.isConfigComplete());
        }

        // Check Bridged Token on SM Network
        bytes32 pickConfigId = vm.envOr("PICK_CONFIG_ID", bytes32(0));
        if (pickConfigId != bytes32(0) && bridgeAddr != address(0)) {
            console.log("");
            console.log("--- Bridged Token Status ---");
            PredictionMarketBridgeRemote bridge =
                PredictionMarketBridgeRemote(payable(bridgeAddr));

            // Check predictor token
            bool isPredictorDeployed =
                bridge.isTokenDeployed(pickConfigId, true);
            console.log("Predictor Token Deployed:", isPredictorDeployed);
            if (isPredictorDeployed) {
                address bridgedToken =
                    bridge.getTokenAddress(pickConfigId, true);
                console.log("Bridged Predictor Token:", bridgedToken);
                console.log(
                    "Balance:", IERC20(bridgedToken).balanceOf(deployer)
                );
            }

            // Check counterparty token
            bool isCounterpartyDeployed =
                bridge.isTokenDeployed(pickConfigId, false);
            console.log("Counterparty Token Deployed:", isCounterpartyDeployed);
            if (isCounterpartyDeployed) {
                address bridgedToken =
                    bridge.getTokenAddress(pickConfigId, false);
                console.log("Bridged Counterparty Token:", bridgedToken);
                console.log(
                    "Balance:", IERC20(bridgedToken).balanceOf(deployer)
                );
            }
        }
    }
}
