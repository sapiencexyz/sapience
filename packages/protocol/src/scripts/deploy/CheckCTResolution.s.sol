// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import {
    ConditionalTokensConditionResolver
} from "../../resolvers/conditionalTokens/ConditionalTokensConditionResolver.sol";
import {
    IConditionalTokensConditionResolver
} from "../../resolvers/conditionalTokens/interfaces/IConditionalTokensConditionResolver.sol";

/// @title Check CT Resolution on Ethereal
/// @notice Reads the condition state on ConditionalTokensConditionResolver after
///         a resolution was sent from Polygon via LayerZero.
///
/// Usage:
///   CONDITION_ID=0x... forge script \
///     src/scripts/mainnet/CheckCTResolution.s.sol:CheckCTResolution \
///     --rpc-url $PM_NETWORK_RPC_URL
///
/// Env vars:
///   CT_CONDITION_RESOLVER_ADDRESS  - ConditionalTokensConditionResolver on Ethereal
///   CONDITION_ID                   - The conditionId to check
contract CheckCTResolution is Script {
    function run() external view {
        address resolverAddr = vm.envAddress("CT_CONDITION_RESOLVER_ADDRESS");
        bytes32 conditionId = vm.envBytes32("CONDITION_ID");

        ConditionalTokensConditionResolver resolver =
            ConditionalTokensConditionResolver(resolverAddr);

        console.log("=== Check CT Resolution ===");
        console.log("Resolver (Ethereal):", resolverAddr);
        console.log("Condition ID:", vm.toString(conditionId));

        IConditionalTokensConditionResolver.ConditionState memory state =
            resolver.getCondition(conditionId);

        console.log("");
        console.log("=== Condition State ===");
        console.log("Settled:", state.settled);
        console.log("Invalid:", state.invalid);
        console.log("Non-decisive:", state.nonDecisive);
        console.log("Resolved to YES:", state.resolvedToYes);
        console.log("Payout denominator:", state.payoutDenominator);
        console.log("No payout:", state.noPayout);
        console.log("Yes payout:", state.yesPayout);
        console.log("Updated at:", uint256(state.updatedAt));

        bool finalized = resolver.isFinalized(abi.encode(conditionId));
        console.log("");
        if (finalized) {
            console.log("STATUS: FINALIZED");
            if (state.resolvedToYes) {
                console.log("OUTCOME: YES");
            } else {
                console.log("OUTCOME: NO");
            }
        } else if (state.settled && state.nonDecisive) {
            console.log("STATUS: SETTLED (TIE)");
        } else if (state.invalid) {
            console.log("STATUS: INVALID (payouts don't match denominator)");
        } else {
            console.log("STATUS: NOT RESOLVED YET");
            console.log(
                "If you already sent requestResolution, wait ~1-2 min for LayerZero delivery."
            );
        }
    }
}
