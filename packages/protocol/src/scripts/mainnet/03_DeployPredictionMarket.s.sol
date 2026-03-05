// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";

/// @title Deploy Prediction Market V2 (Mainnet)
/// @notice Deploys PredictionMarketEscrow contract on Ethereal mainnet
contract DeployPredictionMarket is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");

        console.log("=== Deploy Prediction Market V2 (Mainnet) ===");
        console.log("Owner:", deployer);
        console.log("Collateral Token:", collateralToken);
        console.log("Token Factory:", factoryAddress);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        PredictionMarketEscrow market = new PredictionMarketEscrow(
            collateralToken, deployer, factoryAddress
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("PredictionMarketEscrow:", address(market));
        console.log("");
        console.log("Add to .env:");
        console.log("PREDICTION_MARKET_ADDRESS=", address(market));
    }
}
