// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {PositionTokenFactory} from "../../../v2/bridge/PositionTokenFactory.sol";
import {PredictionMarketV2} from "../../../v2/PredictionMarketV2.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Check Status
/// @notice Check deployment status and balances
contract CheckStatus is Script {
    function run() external view {
        console.log("=== Deployment Status Check ===");
        console.log("");

        // Addresses from env
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        console.log("Deployer:", deployer);

        // Check Collateral Token
        address collateralAddr = vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        if (collateralAddr != address(0)) {
            console.log("");
            console.log("--- Collateral Token ---");
            console.log("Address:", collateralAddr);
            console.log("Balance:", IERC20(collateralAddr).balanceOf(deployer));
        }

        // Check Prediction Market
        address marketAddr = vm.envOr("PREDICTION_MARKET_ADDRESS", address(0));
        if (marketAddr != address(0)) {
            console.log("");
            console.log("--- Prediction Market V2 ---");
            console.log("Address:", marketAddr);
            PredictionMarketV2 market = PredictionMarketV2(marketAddr);
            console.log("Collateral Token:", address(market.collateralToken()));
        }

        // Check Ethereal Bridge
        address etherealBridgeAddr = vm.envOr("ETHEREAL_BRIDGE_ADDRESS", address(0));
        if (etherealBridgeAddr != address(0)) {
            console.log("");
            console.log("--- Ethereal Bridge ---");
            console.log("Address:", etherealBridgeAddr);
            PositionTokenBridge etherealBridge = PositionTokenBridge(payable(etherealBridgeAddr));
            console.log("Owner:", etherealBridge.owner());
            console.log("ETH Balance:", etherealBridge.getETHBalance());
            console.log("Config Complete:", etherealBridge.isConfigComplete());
            IPositionTokenBridgeBase.BridgeConfig memory config = etherealBridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("Remote Bridge:", config.remoteBridge);
        }

        // Check Arbitrum Bridge
        address arbBridgeAddr = vm.envOr("ARB_BRIDGE_ADDRESS", address(0));
        if (arbBridgeAddr != address(0)) {
            console.log("");
            console.log("--- Arbitrum Bridge ---");
            console.log("Address:", arbBridgeAddr);
            PositionTokenBridgeRemote arbBridge = PositionTokenBridgeRemote(payable(arbBridgeAddr));
            console.log("Owner:", arbBridge.owner());
            console.log("ETH Balance:", arbBridge.getETHBalance());
            console.log("Factory:", arbBridge.getFactory());
            console.log("Config Complete:", arbBridge.isConfigComplete());
            IPositionTokenBridgeBase.BridgeConfig memory config = arbBridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("Remote Bridge:", config.remoteBridge);
        }

        // Check Factory
        address factoryAddr = vm.envOr("FACTORY_ADDRESS", address(0));
        if (factoryAddr != address(0)) {
            console.log("");
            console.log("--- Position Token Factory ---");
            console.log("Address:", factoryAddr);
            PositionTokenFactory factory = PositionTokenFactory(factoryAddr);
            console.log("Owner:", factory.owner());
            console.log("Deployer:", factory.deployer());
            console.log("Config Complete:", factory.isConfigComplete());
        }

        // Check Position Tokens
        address predictorTokenAddr = vm.envOr("PREDICTOR_TOKEN_ADDRESS", address(0));
        if (predictorTokenAddr != address(0)) {
            console.log("");
            console.log("--- Predictor Token ---");
            console.log("Address:", predictorTokenAddr);
            console.log("Balance:", IERC20(predictorTokenAddr).balanceOf(deployer));
        }

        // Check Bridged Token on Arbitrum
        bytes32 pickConfigId = vm.envOr("PICK_CONFIG_ID", bytes32(0));
        if (pickConfigId != bytes32(0) && arbBridgeAddr != address(0)) {
            console.log("");
            console.log("--- Bridged Token Status ---");
            PositionTokenBridgeRemote arbBridge = PositionTokenBridgeRemote(payable(arbBridgeAddr));
            bool isDeployed = arbBridge.isTokenDeployed(pickConfigId, true);
            console.log("Token Deployed:", isDeployed);
            if (isDeployed) {
                address bridgedToken = arbBridge.getTokenAddress(pickConfigId, true);
                console.log("Bridged Token Address:", bridgedToken);
                console.log("Bridged Token Balance:", IERC20(bridgedToken).balanceOf(deployer));
            }
        }
    }
}
