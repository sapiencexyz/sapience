// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { OnboardingSponsor } from "../../../v2/sponsors/OnboardingSponsor.sol";

/// @title Deploy OnboardingSponsor (Testnet)
/// @notice Deploys a OnboardingSponsor for the onboarding flow
///
/// Required env vars:
///   PM_NETWORK_DEPLOYER_PRIVATE_KEY - deployer private key
///   PM_NETWORK_DEPLOYER_ADDRESS     - deployer address (becomes owner)
///   PREDICTION_MARKET_ESCROW        - escrow contract address
///   COLLATERAL_TOKEN                - WUSDe token address
///   MATCH_LIMIT                     - max collateral per mint (in wei, e.g. 1000000000000000000 = 1e18)
///   BUDGET_MANAGER                  - API signer address (optional, can set later)
contract DeployOnboardingSponsor is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address escrow = vm.envAddress("PREDICTION_MARKET_ESCROW");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN");
        uint256 matchLimit = vm.envUint("MATCH_LIMIT");

        console.log("=== Deploy OnboardingSponsor (Testnet) ===");
        console.log("Owner:", deployer);
        console.log("Escrow:", escrow);
        console.log("Collateral Token:", collateralToken);
        console.log("Match Limit:", matchLimit);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        OnboardingSponsor sponsor =
            new OnboardingSponsor(escrow, collateralToken, matchLimit, deployer);

        // Set budget manager if provided
        address budgetManager = vm.envOr("BUDGET_MANAGER", address(0));
        if (budgetManager != address(0)) {
            sponsor.setBudgetManager(budgetManager);
            console.log("Budget Manager:", budgetManager);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployed ===");
        console.log("OnboardingSponsor:", address(sponsor));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Fund the contract with collateral tokens");
        console.log("  2. Set budget manager (if not set above): sponsor.setBudgetManager(apiSigner)");
        console.log("  3. API signer calls setBudget(user, amount) when user enters invite code");
    }
}
