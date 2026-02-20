// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { MatchedSponsor } from "../../../v2/sponsors/MatchedSponsor.sol";

/// @title Deploy MatchedSponsor (Testnet)
/// @notice Deploys a MatchedSponsor for the onboarding flow
///
/// Required env vars:
///   PM_NETWORK_DEPLOYER_PRIVATE_KEY - deployer private key
///   PM_NETWORK_DEPLOYER_ADDRESS     - deployer address (becomes owner)
///   PREDICTION_MARKET_ESCROW        - escrow contract address
///   COLLATERAL_TOKEN                - WUSDe token address
///   MATCH_LIMIT                     - max collateral per mint (in wei, e.g. 1000000000000000000 = 1e18)
///   BUDGET_MANAGER                  - API signer address (optional, can set later)
contract DeployMatchedSponsor is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address escrow = vm.envAddress("PREDICTION_MARKET_ESCROW");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");
        uint256 matchLimit = vm.envUint("MATCH_LIMIT");

        console.log("=== Deploy MatchedSponsor (Testnet) ===");
        console.log("Owner:", deployer);
        console.log("Escrow:", escrow);
        console.log("Collateral Token:", collateralToken);
        console.log("Match Limit:", matchLimit);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        MatchedSponsor sponsor =
            new MatchedSponsor(escrow, collateralToken, matchLimit, deployer);

        // Set budget manager if provided
        address budgetManager = vm.envOr("BUDGET_MANAGER", address(0));
        if (budgetManager != address(0)) {
            sponsor.setBudgetManager(budgetManager);
            console.log("Budget Manager:", budgetManager);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("MatchedSponsor:", address(sponsor));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Fund the contract with collateral tokens");
        console.log("  2. Set budget manager (if not set above): sponsor.setBudgetManager(apiSigner)");
        console.log("  3. API signer calls setBudget(user, amount) when user enters invite code");
    }
}
