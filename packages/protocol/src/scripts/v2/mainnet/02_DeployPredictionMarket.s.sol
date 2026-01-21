// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarketV2 } from "../../../v2/PredictionMarketV2.sol";

/// @title Deploy Prediction Market V2 (Mainnet)
/// @notice Deploys PredictionMarketV2 contract on Ethereal mainnet
contract DeployPredictionMarket is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");

        console.log("=== Deploy Prediction Market V2 (Mainnet) ===");
        console.log("Owner:", deployer);
        console.log("Collateral Token:", collateralToken);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PredictionMarketV2 market =
            new PredictionMarketV2(collateralToken, deployer);

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketV2:", address(market));
        console.log("");
        console.log("Add to .env:");
        console.log("PREDICTION_MARKET_ADDRESS=", address(market));
    }
}
