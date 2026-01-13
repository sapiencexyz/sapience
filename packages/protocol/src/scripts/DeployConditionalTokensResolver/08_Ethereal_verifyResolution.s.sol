// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";

/**
 * @title VerifyResolution
 * @notice Verify that resolution was received and processed on Ethereal resolver
 * @dev Checks the resolver state for a given conditionId
 *      
 *      Required env vars:
 *      - ETHEREAL_CONDITIONAL_TOKENS_RESOLVER: Resolver address on Ethereal
 *      - TEST_CONDITION_ID: bytes32 conditionId to check (hex format)
 *      
 *      Run with:
 *      forge script src/scripts/DeployConditionalTokensResolver/08_Ethereal_verifyResolution.s.sol \
 *        --rpc-url $ETHEREAL_RPC
 */
contract VerifyResolution is Script {
    function run() external view {
        address resolver = vm.envAddress("ETHEREAL_CONDITIONAL_TOKENS_RESOLVER");
        
        // Get condition ID from env (hex format: 0x...)
        bytes32 conditionId = vm.envBytes32("TEST_CONDITION_ID");
        
        // If not set, use a test condition ID
        if (conditionId == bytes32(0)) {
            conditionId = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
        }

        console.log("=== Verifying Resolution on Ethereal ===");
        console.log("Resolver:", resolver);
        console.log("Condition ID:", vm.toString(conditionId));
        console.log("");

        PredictionMarketLZConditionalTokensResolver resolverContract = 
            PredictionMarketLZConditionalTokensResolver(resolver);

        // Get condition state
        IPredictionMarketLZConditionalTokensResolver.ConditionState memory condition =
            resolverContract.getCondition(conditionId);

        console.log("Condition State:");
        console.log("  Condition ID:", vm.toString(condition.conditionId));
        console.log("  Settled:", condition.settled);
        console.log("  Resolved to YES:", condition.resolvedToYes);
        console.log("  Invalid:", condition.invalid);
        console.log("  Payout Denominator:", condition.payoutDenominator);
        console.log("  No Payout:", condition.noPayout);
        console.log("  Yes Payout:", condition.yesPayout);
        console.log("  Updated At:", condition.updatedAt);
        console.log("");

        if (condition.conditionId == bytes32(0)) {
            console.log("[ERROR] Condition not found - resolution message may not have arrived yet");
            console.log("   Wait a bit longer and try again");
        } else if (!condition.settled) {
            if (condition.invalid) {
                console.log("[WARNING] Condition marked as invalid (non-binary outcome)");
            } else {
                console.log("[PENDING] Condition received but not settled (denom=0 means not resolved on Polygon yet)");
            }
        } else {
            console.log("[SUCCESS] Condition successfully resolved!");
            console.log("   Outcome:", condition.resolvedToYes ? "YES" : "NO");
        }
    }
}

