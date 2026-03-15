// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import {
    ManualConditionResolver
} from "../../resolvers/mocks/ManualConditionResolver.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";

/// @title Resolve Prediction (Mainnet)
/// @notice Resolves a prediction by settling the condition and the prediction
/// @dev Requires the deployer to be an approved settler on the ManualConditionResolver
contract ResolvePrediction is Script {
    function run() external {
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");
        address marketAddr = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        bytes32 conditionId = vm.envBytes32("CONDITION_ID");
        bytes32 predictionId = vm.envBytes32("PREDICTION_ID");

        // Outcome: "yes", "no", or "tie"
        string memory outcomeStr = vm.envOr("OUTCOME", string("yes"));

        uint256 deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        ManualConditionResolver resolver = ManualConditionResolver(resolverAddr);
        PredictionMarketEscrow market = PredictionMarketEscrow(marketAddr);

        console.log("=== Resolve Prediction (Mainnet) ===");
        console.log("Resolver:", resolverAddr);
        console.log("Market:", marketAddr);
        console.log("Condition ID:", vm.toString(conditionId));
        console.log("Prediction ID:", vm.toString(predictionId));
        console.log("Deployer:", deployer);
        console.log("Outcome:", outcomeStr);

        // Determine outcome vector
        IV2Types.OutcomeVector memory outcome;
        if (_strEq(outcomeStr, "yes")) {
            outcome = IV2Types.OutcomeVector({ yesWeight: 1, noWeight: 0 });
            console.log("Outcome Vector: YES wins [1, 0]");
        } else if (_strEq(outcomeStr, "no")) {
            outcome = IV2Types.OutcomeVector({ yesWeight: 0, noWeight: 1 });
            console.log("Outcome Vector: NO wins [0, 1]");
        } else if (_strEq(outcomeStr, "tie")) {
            outcome = IV2Types.OutcomeVector({ yesWeight: 1, noWeight: 1 });
            console.log("Outcome Vector: TIE [1, 1]");
        } else {
            revert("Invalid outcome: use 'yes', 'no', or 'tie'");
        }

        // Check if condition already settled
        bool conditionSettled = resolver.isSettled(conditionId);
        console.log("Condition already settled:", conditionSettled);

        vm.startBroadcast(deployerPk);

        // Step 1: Approve deployer as settler if not already
        if (!resolver.approvedSettlers(deployer)) {
            console.log("Approving deployer as settler...");
            resolver.approveSettler(deployer);
            console.log("Deployer approved as settler");
        }

        // Step 2: Settle the condition (if not already settled)
        if (!conditionSettled) {
            console.log("Settling condition...");
            resolver.settleCondition(conditionId, outcome);
            console.log("Condition settled");
        }

        // Step 3: Settle the prediction in PredictionMarketEscrow
        console.log("Settling prediction...");
        market.settle(predictionId, bytes32(0));
        console.log("Prediction settled");

        vm.stopBroadcast();

        // Verify resolution
        (bool resolved, IV2Types.OutcomeVector memory storedOutcome) =
            resolver.getResolution(abi.encode(conditionId));
        console.log("");
        console.log("=== Resolution Complete ===");
        console.log("Condition Resolved:", resolved);
        console.log("Yes Weight:", storedOutcome.yesWeight);
        console.log("No Weight:", storedOutcome.noWeight);
        console.log("Prediction Settled: true");
        console.log("");
        console.log("Next steps:");
        console.log(
            "Winners can now redeem their position tokens for collateral"
        );
    }

    function _strEq(string memory a, string memory b)
        internal
        pure
        returns (bool)
    {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
