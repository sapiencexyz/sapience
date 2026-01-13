// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title DeployAndVerifyConditionalTokensResolver
 * @notice Deploy and verify PredictionMarketLZConditionalTokensResolver on Ethereal
 * @dev This resolver receives resolution data from Polygon ConditionalTokensReader
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/02_Ethereal_deployResolver.s.sol \
 *        --rpc-url $ETHEREAL_RPC --broadcast --private-key $ETHEREAL_PRIVATE_KEY
 *      
 *      Note: Ethereal uses a custom explorer. Verification may need to be done manually
 *      via https://explorer.ethereal.trade
 */
contract DeployAndVerifyConditionalTokensResolver is Script {
    function run() external {
        // Load from environment
        address endpoint = vm.envAddress("ETHEREAL_LZ_ENDPOINT");
        address owner = vm.envAddress("ETHEREAL_OWNER");
        uint256 maxPredictionMarkets = vm.envOr("PM_MAX_MARKETS", uint256(20));

        console.log("=== Deploying PredictionMarketLZConditionalTokensResolver on Ethereal ===");
        console.log("Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("Max Prediction Markets:", maxPredictionMarkets);

        vm.startBroadcast(vm.envUint("ETHEREAL_PRIVATE_KEY"));

        PredictionMarketLZConditionalTokensResolver resolver = new PredictionMarketLZConditionalTokensResolver(
            endpoint,
            owner,
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: maxPredictionMarkets
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PredictionMarketLZConditionalTokensResolver deployed to:", address(resolver));
        console.log("");
        
        // Output verification info
        console.log("=== Verification Info ===");
        console.log("Ethereal uses a custom explorer at https://explorer.ethereal.trade");
        console.log("Constructor arguments:");
        console.log("  endpoint:", endpoint);
        console.log("  owner:", owner);
        console.log("  config.maxPredictionMarkets:", maxPredictionMarkets);
        console.log("");
        
        // Calculate encoded constructor args
        bytes memory encoded = abi.encode(
            endpoint,
            owner,
            IPredictionMarketLZConditionalTokensResolver.Settings({
                maxPredictionMarkets: maxPredictionMarkets
            })
        );
        console.log("Encoded constructor args (hex):");
        console.logBytes(encoded);
        console.log("");
        console.log("To verify manually:");
        console.log("1. Visit https://explorer.ethereal.trade/address/", address(resolver));
        console.log("2. Click 'Verify Contract'");
        console.log("3. Use the encoded constructor args above");
        console.log("");
        
        console.log("Next steps:");
        console.log("1. Set ETHEREAL_CONDITIONAL_TOKENS_RESOLVER=", address(resolver));
        console.log("2. Run script 03_Polygon_configureReader.s.sol");
        console.log("3. Run script 04_Ethereal_configureResolver.s.sol");
        console.log("4. Run script 05_Polygon_setDVN.s.sol");
        console.log("5. Run script 06_Ethereal_setDVN.s.sol");
    }
}

