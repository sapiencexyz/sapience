// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import {
    IPredictionMarketBridgeBase
} from "../../bridge/interfaces/IPredictionMarketBridgeBase.sol";

/// @title Check Status - PM Network (Mainnet)
/// @notice Check deployment status on PM Network (Ethereal mainnet)
contract CheckStatus_PMNetwork is Script {
    function run() external view {
        console.log("=== PM Network Status Check (Mainnet) ===");
        console.log("");

        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        console.log("Deployer:", deployer);

        // Check Collateral Token
        address collateralAddr =
            vm.envOr("COLLATERAL_TOKEN_ADDRESS", address(0));
        if (collateralAddr != address(0)) {
            console.log("");
            console.log("--- Collateral Token ---");
            console.log("Address:", collateralAddr);
            console.log("Balance:", IERC20(collateralAddr).balanceOf(deployer));
        }

        // Check Resolver
        address resolverAddr = vm.envOr("RESOLVER_ADDRESS", address(0));
        if (resolverAddr != address(0)) {
            console.log("");
            console.log("--- Manual Condition Resolver ---");
            console.log("Address:", resolverAddr);
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
        address bridgeAddr = vm.envOr("PM_NETWORK_BRIDGE_ADDRESS", address(0));
        if (bridgeAddr != address(0)) {
            console.log("");
            console.log("--- PM Network Bridge ---");
            console.log("Address:", bridgeAddr);
            PredictionMarketBridge bridge =
                PredictionMarketBridge(payable(bridgeAddr));
            console.log("Owner:", bridge.owner());
            console.log("ETH Balance:", bridge.getETHBalance());
            console.log("Config Complete:", bridge.isConfigComplete());
            IPredictionMarketBridgeBase.BridgeConfig memory config =
                bridge.getBridgeConfig();
            console.log("Remote EID:", config.remoteEid);
            console.log("Remote Bridge:", config.remoteBridge);
        }
    }
}
