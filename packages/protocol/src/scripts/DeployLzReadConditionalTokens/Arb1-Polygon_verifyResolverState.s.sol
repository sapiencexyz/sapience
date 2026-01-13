// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import {PredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/PredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketLZConditionalTokensResolver} from "../../predictionMarket/resolvers/interfaces/IPredictionMarketLZConditionalTokensResolver.sol";
import {IPredictionMarketResolver} from "../../predictionMarket/interfaces/IPredictionMarketResolver.sol";

/**
 * @title VerifyResolverStateScript
 * @notice Verify that the resolver has correctly cached outcomes from lzRead
 * @dev Run with:
 *      forge script src/scripts/DeployLzReadConditionalTokens/Arb1-Polygon_verifyResolverState.s.sol \
 *        --rpc-url $ARB_RPC
 *      
 *      This is a READ-ONLY script (no broadcast needed)
 */
contract VerifyResolverStateScript is Script {
    // Hardcoded values - existing deployed contract on Arbitrum One
    address constant RESOLVER = 0x0fA078C5fD18148337d2ADCadbE8590D39a49AC6;
    // Condition IDs from fork test (real Polymarket conditions)
    bytes32 constant CONDITION_YES = 0x67903aa8fb5c90e936777cebd9c6570cb70dfeb1128008c04f11ae8e162111bc;
    bytes32 constant CONDITION_NO = 0xace50cca5ccad582a0cbe373d62b6c6796dd89202bf47c726a3abb48688ba25e;

    function run() external view {
        // All values are hardcoded - no env vars needed (read-only script)
        address resolverAddr = RESOLVER;
        bytes32 conditionYes = CONDITION_YES;
        bytes32 conditionNo = CONDITION_NO;

        PredictionMarketLZConditionalTokensResolver resolver = 
            PredictionMarketLZConditionalTokensResolver(payable(resolverAddr));

        console.log("=== Verifying Resolver State ===");
        console.log("Resolver:", resolverAddr);
        console.log("");

        // ========== Verify YES Condition ==========
        console.log("--- Condition YES ---");
        console.log("ConditionId:", vm.toString(conditionYes));
        
        PredictionMarketLZConditionalTokensResolver.ConditionState memory stateYes = 
            resolver.getCondition(conditionYes);
        
        _printConditionState(stateYes);
        
        bool yesOk = _verifyYesCondition(stateYes);
        
        // ========== Verify NO Condition ==========
        console.log("");
        console.log("--- Condition NO ---");
        console.log("ConditionId:", vm.toString(conditionNo));
        
        PredictionMarketLZConditionalTokensResolver.ConditionState memory stateNo = 
            resolver.getCondition(conditionNo);
        
        _printConditionState(stateNo);
        
        bool noOk = _verifyNoCondition(stateNo);

        // ========== Test getPredictionResolution ==========
        console.log("");
        console.log("--- Testing getPredictionResolution ---");
        
        // Test YES prediction
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomesYes =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomesYes[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: conditionYes,
            prediction: true // Predicting YES
        });
        bytes memory encodedYes = abi.encode(outcomesYes);
        (bool isResolvedYes, IPredictionMarketResolver.Error errorYes, bool parlaySuccessYes) =
            resolver.getPredictionResolution(encodedYes);
        
        console.log("YES prediction (expected: parlay success):");
        console.log("  isResolved:", isResolvedYes);
        console.log("  error:", uint256(errorYes));
        console.log("  parlaySuccess:", parlaySuccessYes);

        // Test NO prediction
        IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[] memory outcomesNo =
            new IPredictionMarketLZConditionalTokensResolver.PredictedOutcome[](1);
        outcomesNo[0] = IPredictionMarketLZConditionalTokensResolver.PredictedOutcome({
            marketId: conditionNo,
            prediction: false // Predicting NO
        });
        bytes memory encodedNo = abi.encode(outcomesNo);
        (bool isResolvedNo, IPredictionMarketResolver.Error errorNo, bool parlaySuccessNo) =
            resolver.getPredictionResolution(encodedNo);
        
        console.log("NO prediction (expected: parlay success):");
        console.log("  isResolved:", isResolvedNo);
        console.log("  error:", uint256(errorNo));
        console.log("  parlaySuccess:", parlaySuccessNo);

        // ========== Summary ==========
        console.log("");
        console.log("=== Verification Summary ===");
        
        if (!stateYes.settled && !stateNo.settled) {
            console.log("PENDING: Neither condition has been settled yet.");
            console.log("The lzRead callbacks may still be in flight.");
            console.log("Wait a bit and re-run this script.");
        } else if (yesOk && noOk) {
            console.log("SUCCESS: Both conditions verified correctly!");
            console.log("- YES condition settled to YES");
            console.log("- NO condition settled to NO");
        } else {
            console.log("ISSUES DETECTED:");
            if (!yesOk) console.log("- YES condition verification failed");
            if (!noOk) console.log("- NO condition verification failed");
        }
    }

    function _printConditionState(
        PredictionMarketLZConditionalTokensResolver.ConditionState memory state
    ) internal pure {
        console.log("  settled:", state.settled);
        console.log("  invalid:", state.invalid);
        console.log("  resolvedToYes:", state.resolvedToYes);
        console.log("  payoutDenominator:", state.payoutDenominator);
        console.log("  noPayout:", state.noPayout);
        console.log("  yesPayout:", state.yesPayout);
        console.log("  updatedAt:", state.updatedAt);
    }

    function _verifyYesCondition(
        PredictionMarketLZConditionalTokensResolver.ConditionState memory state
    ) internal pure returns (bool) {
        if (!state.settled) {
            console.log("  [PENDING] Not settled yet");
            return false;
        }
        
        bool ok = true;
        
        if (state.invalid) {
            console.log("  [FAIL] Condition marked as invalid");
            ok = false;
        }
        
        if (!state.resolvedToYes) {
            console.log("  [FAIL] Expected resolvedToYes=true, got false");
            ok = false;
        }
        
        // For YES: noPayout should be 0, yesPayout should equal denom
        if (state.noPayout != 0) {
            console.log("  [FAIL] Expected noPayout=0");
            ok = false;
        }
        
        if (state.yesPayout != state.payoutDenominator) {
            console.log("  [FAIL] Expected yesPayout == payoutDenominator");
            ok = false;
        }
        
        if (ok) {
            console.log("  [PASS] Verified correctly as YES outcome");
        }
        
        return ok;
    }

    function _verifyNoCondition(
        PredictionMarketLZConditionalTokensResolver.ConditionState memory state
    ) internal pure returns (bool) {
        if (!state.settled) {
            console.log("  [PENDING] Not settled yet");
            return false;
        }
        
        bool ok = true;
        
        if (state.invalid) {
            console.log("  [FAIL] Condition marked as invalid");
            ok = false;
        }
        
        if (state.resolvedToYes) {
            console.log("  [FAIL] Expected resolvedToYes=false, got true");
            ok = false;
        }
        
        // For NO: noPayout should equal denom, yesPayout should be 0
        if (state.yesPayout != 0) {
            console.log("  [FAIL] Expected yesPayout=0");
            ok = false;
        }
        
        if (state.noPayout != state.payoutDenominator) {
            console.log("  [FAIL] Expected noPayout == payoutDenominator");
            ok = false;
        }
        
        if (ok) {
            console.log("  [PASS] Verified correctly as NO outcome");
        }
        
        return ok;
    }
}


