// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {ConditionalTokensReader} from "../../predictionMarket/resolvers/ConditionalTokensReader.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/**
 * @title TestConditionalTokensFlow
 * @notice Test the full flow: request resolution on Polygon, verify on Ethereal
 * @dev This script tests the end-to-end flow:
 *      1. Quote fee on Polygon
 *      2. Request resolution on Polygon (reads ConditionalTokens and sends to Ethereal)
 *      3. Wait for message delivery
 *      4. Verify resolution on Ethereal resolver
 *      
 *      Required env vars:
 *      - POLYGON_CONDITIONAL_TOKENS_READER: ConditionalTokensReader address on Polygon
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Resolver address on Ethereal
 *      - TEST_CONDITION_ID: bytes32 conditionId to test (hex format)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/07_Polygon_testFlow.s.sol \
 *        --rpc-url $POLYGON_RPC --broadcast --private-key $POLYGON_PRIVATE_KEY
 */
contract TestConditionalTokensFlow is Script {
    function run() external {
        address polygonReader = vm.envAddress("POLYGON_CONDITIONAL_TOKENS_READER");
        
        // Get condition ID from env (hex format: 0x...)
        bytes32 conditionId = vm.envBytes32("TEST_CONDITION_ID");
        
        // If not set, use a test condition ID
        if (conditionId == bytes32(0)) {
            console.log("WARNING: TEST_CONDITION_ID not set, using test value");
            conditionId = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
        }

        console.log("=== Testing ConditionalTokens Resolution Flow ===");
        console.log("Polygon Reader:", polygonReader);
        console.log("Condition ID:", vm.toString(conditionId));
        console.log("");

        ConditionalTokensReader reader = ConditionalTokensReader(payable(polygonReader));

        // Step 1: Quote fee
        console.log("Step 1: Quoting fee...");
        MessagingFee memory fee = reader.quoteResolution(conditionId);
        console.log("  Native fee:", fee.nativeFee);
        console.log("  LZ token fee:", fee.lzTokenFee);
        console.log("");

        // Step 2: Request resolution (this will read ConditionalTokens and send to Ethereal)
        console.log("Step 2: Requesting resolution...");
        console.log("  Sending", fee.nativeFee, "wei as msg.value");
        
        vm.startBroadcast(vm.envUint("POLYGON_PRIVATE_KEY"));
        
        reader.requestResolution{value: fee.nativeFee}(conditionId);
        
        vm.stopBroadcast();

        console.log("  Resolution request sent!");
        console.log("");
        console.log("=== Request Complete ===");
        console.log("The ConditionalTokensReader has:");
        console.log("  1. Read payoutDenominator, noPayout, yesPayout from ConditionalTokens");
        console.log("  2. Sent resolution data to Ethereal resolver via LayerZero");
        console.log("");
        console.log("Next steps:");
        console.log("1. Wait ~30-60 seconds for LayerZero message delivery");
        console.log("2. Run script 08_Ethereal_verifyResolution.s.sol to check resolver state:");
        console.log("   forge script src/scripts/DeployConditionalTokensResolver/08_Ethereal_verifyResolution.s.sol \\");
        console.log("     --rpc-url $ETHEREAL_RPC");
        console.log("     -vvvv");
    }
}

