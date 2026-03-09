// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { OnboardingSponsor } from "../../sponsors/OnboardingSponsor.sol";

/// @title Deploy OnboardingSponsor (Mainnet)
/// @notice Deploys an OnboardingSponsor for the onboarding flow
///
/// Required env vars:
///   PM_NETWORK_DEPLOYER_PRIVATE_KEY - deployer private key
///   PM_NETWORK_DEPLOYER_ADDRESS     - deployer address (becomes owner)
///   PREDICTION_MARKET_ADDRESS       - escrow contract address
///   COLLATERAL_TOKEN_ADDRESS        - WUSDe token address
///   REQUIRED_COUNTERPARTY           - required counterparty address (e.g. vault-bot)
///   MAX_ENTRY_PRICE_BPS             - max entry price in basis points (e.g. 7000 = 0.70)
///
/// Optional env vars (can be set later by owner):
///   MATCH_LIMIT                     - max collateral per mint (default: 1e18)
///   BUDGET_MANAGER                  - API signer address
contract DeployOnboardingSponsor is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address escrow = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        address requiredCounterparty = vm.envAddress("REQUIRED_COUNTERPARTY");
        uint256 maxEntryPriceBps = vm.envUint("MAX_ENTRY_PRICE_BPS");
        uint256 matchLimit = vm.envOr("MATCH_LIMIT", uint256(1 ether));

        console.log("=== Deploy OnboardingSponsor (Mainnet) ===");
        console.log("Owner:", deployer);
        console.log("Escrow:", escrow);
        console.log("Collateral Token:", collateralToken);
        console.log("Required Counterparty:", requiredCounterparty);
        console.log("Max Entry Price BPS:", maxEntryPriceBps);
        console.log("Match Limit:", matchLimit);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        OnboardingSponsor sponsor = new OnboardingSponsor(
            escrow,
            collateralToken,
            requiredCounterparty,
            maxEntryPriceBps,
            matchLimit,
            deployer
        );

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
        console.log(
            "  2. Set budget manager (if not set above): sponsor.setBudgetManager(apiSigner)"
        );
        console.log(
            "  3. API signer calls setBudget(user, amount) when user enters invite code"
        );
    }
}
