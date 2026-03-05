// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";
import {
    PredictionMarketTokenFactory
} from "../../PredictionMarketTokenFactory.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import {
    IPredictionMarketBridgeBase
} from "../../bridge/interfaces/IPredictionMarketBridgeBase.sol";

/// @title Check Status
/// @notice Check deployment status and balances
contract CheckStatus is Script {
    function run() external view {
        console.log("=== Deployment Status Check ===");
        console.log("");

        // Addresses from env
        address pmDeployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address smDeployer = vm.envOr("SM_NETWORK_DEPLOYER_ADDRESS", pmDeployer);
        console.log("PM Network Deployer:", pmDeployer);
        console.log("SM Network Deployer:", smDeployer);

        // Check Collateral Token (PM Network)
        address collateralAddr =
            vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        if (collateralAddr != address(0)) {
            console.log("");
            console.log("--- Collateral Token ---");
            console.log("Address:", collateralAddr);
            console.log(
                "PM Deployer Balance:",
                IERC20(collateralAddr).balanceOf(pmDeployer)
            );
        }

        // Check Prediction Market
        address marketAddr = vm.envOr("PREDICTION_MARKET_ADDRESS", address(0));
        if (marketAddr != address(0)) {
            console.log("");
            console.log("--- Prediction Market V2 ---");
            console.log("Address:", marketAddr);
            PredictionMarketEscrow market = PredictionMarketEscrow(marketAddr);
            console.log("Collateral Token:", address(market.collateralToken()));
        }

        // Check PM Network Bridge
        address etherealBridgeAddr =
            vm.envOr("PM_NETWORK_BRIDGE_ADDRESS", address(0));
        if (etherealBridgeAddr != address(0)) {
            console.log("");
            console.log("--- PM Network Bridge ---");
            console.log("Address:", etherealBridgeAddr);
            PredictionMarketBridge etherealBridge =
                PredictionMarketBridge(payable(etherealBridgeAddr));
            console.log("Owner:", etherealBridge.owner());
            console.log("ETH Balance:", etherealBridge.getETHBalance());
            console.log("Config Complete:", etherealBridge.isConfigComplete());
            IPredictionMarketBridgeBase.BridgeConfig memory config =
                etherealBridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("SM Network Bridge:", config.remoteBridge);
        }

        // Check Arbitrum Bridge
        address arbBridgeAddr =
            vm.envOr("SM_NETWORK_BRIDGE_ADDRESS", address(0));
        if (arbBridgeAddr != address(0)) {
            console.log("");
            console.log("--- Arbitrum Bridge ---");
            console.log("Address:", arbBridgeAddr);
            PredictionMarketBridgeRemote arbBridge =
                PredictionMarketBridgeRemote(payable(arbBridgeAddr));
            console.log("Owner:", arbBridge.owner());
            console.log("ETH Balance:", arbBridge.getETHBalance());
            console.log("Factory:", arbBridge.getFactory());
            console.log("Config Complete:", arbBridge.isConfigComplete());
            IPredictionMarketBridgeBase.BridgeConfig memory config =
                arbBridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("SM Network Bridge:", config.remoteBridge);
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

        // Check Position Tokens (PM Network)
        address predictorTokenAddr =
            vm.envOr("PREDICTOR_TOKEN_ADDRESS", address(0));
        if (predictorTokenAddr != address(0)) {
            console.log("");
            console.log("--- Predictor Token (PM Network) ---");
            console.log("Address:", predictorTokenAddr);
            console.log(
                "PM Deployer Balance:",
                IERC20(predictorTokenAddr).balanceOf(pmDeployer)
            );
        }

        // Check Bridged Token on SM Network
        bytes32 pickConfigId = vm.envOr("PICK_CONFIG_ID", bytes32(0));
        if (pickConfigId != bytes32(0) && arbBridgeAddr != address(0)) {
            console.log("");
            console.log("--- Bridged Token Status (SM Network) ---");
            PredictionMarketBridgeRemote arbBridge =
                PredictionMarketBridgeRemote(payable(arbBridgeAddr));
            bool isDeployed = arbBridge.isTokenDeployed(pickConfigId, true);
            console.log("Token Deployed:", isDeployed);
            if (isDeployed) {
                address bridgedToken =
                    arbBridge.getTokenAddress(pickConfigId, true);
                console.log("Bridged Token Address:", bridgedToken);
                console.log(
                    "SM Deployer Balance:",
                    IERC20(bridgedToken).balanceOf(smDeployer)
                );
            }
        }
    }
}
