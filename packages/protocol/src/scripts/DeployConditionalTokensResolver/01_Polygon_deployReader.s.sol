// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ConditionalTokensReader} from "../../predictionMarket/resolvers/ConditionalTokensReader.sol";
import {IConditionalTokensReader} from "../../predictionMarket/resolvers/interfaces/IConditionalTokensReader.sol";

/**
 * @title DeployAndVerifyConditionalTokensReader
 * @notice Deploy and verify ConditionalTokensReader on Polygon
 * @dev This contract reads ConditionalTokens and sends resolution data to Ethereal resolver
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/01_Polygon_deployReader.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY --verify
 *      
 *      For verification, ensure POLYGONSCAN_API_KEY is set in your environment.
 */
contract DeployAndVerifyConditionalTokensReader is Script {
    function run() external {
        // Load from environment
        console.log("=== Deploying ConditionalTokensReader on Polygon ===");
        
        address endpoint = vm.envAddress("POLYGON_LZ_ENDPOINT");
        address owner = vm.envAddress("POLYGON_OWNER");
        address conditionalTokens = vm.envOr("POLYGON_CONDITIONAL_TOKENS", address(0x4D97DCd97eC945f40cF65F87097ACe5EA0476045));
        
        console.log("Endpoint:", endpoint);
        console.log("Owner:", owner);
        console.log("ConditionalTokens:", conditionalTokens);

        vm.startBroadcast(vm.envUint("POLYGON_PRIVATE_KEY"));

        ConditionalTokensReader reader = new ConditionalTokensReader(
            endpoint,
            owner,
            IConditionalTokensReader.Settings({
                conditionalTokens: conditionalTokens
            })
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("ConditionalTokensReader deployed to:", address(reader));
        console.log("");
        
        // Output verification command
        console.log("=== Verification Command ===");
        console.log("If verification didn't run automatically, use:");
        console.log("");
        console.log("forge verify-contract \\");
        console.log("  ", address(reader), " \\");
        console.log("  src/predictionMarket/resolvers/ConditionalTokensReader.sol:ConditionalTokensReader \\");
        console.log("  --chain-id 137 \\");
        console.log("  --etherscan-api-key $POLYGONSCAN_API_KEY \\");
        console.log("  --constructor-args $(cast abi-encode \"constructor(address,address,(address))\" \\");
        console.log("    ", vm.toString(endpoint), " \\");
        console.log("    ", vm.toString(owner), " \\");
        console.log("    \"(", vm.toString(conditionalTokens), ")\")");
        console.log("");
        
        // Calculate encoded constructor args for manual use
        bytes memory encoded = abi.encode(
            endpoint,
            owner,
            IConditionalTokensReader.Settings({
                conditionalTokens: conditionalTokens
            })
        );
        console.log("Encoded constructor args (hex):");
        console.logBytes(encoded);
        console.log("");
        
        console.log("Next steps:");
        console.log("1. Set POLYGON_CONDITIONAL_TOKENS_READER=", address(reader));
        console.log("2. Run script 02_Ethereal_deployResolver.s.sol");
        console.log("3. Run script 03_Polygon_configureReader.s.sol");
        console.log("4. Run script 04_Ethereal_configureResolver.s.sol");
        console.log("5. Run script 05_Polygon_setDVN.s.sol");
        console.log("6. Run script 06_Ethereal_setDVN.s.sol");
    }
}

