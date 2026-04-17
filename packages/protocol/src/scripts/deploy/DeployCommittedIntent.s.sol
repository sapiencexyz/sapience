// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { PreMintEscrow } from "../../PreMintEscrow.sol";
import { CounterpartyVault } from "../../CounterpartyVault.sol";
import { InsurancePool } from "../../InsurancePool.sol";
import { CommittedIntentExecutor } from "../../CommittedIntentExecutor.sol";
import { OnboardingSponsorV2 } from "../../sponsors/OnboardingSponsorV2.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";

/// @title DeployCommittedIntent
/// @notice Deploys the committed-intent stack:
///         OnboardingSponsorV2 → (Pre-commit dependency computation) →
///         PreMintEscrow / CounterpartyVault / InsurancePool →
///         CommittedIntentExecutor
///         And wires `trustedMintRouter` on the existing PredictionMarketEscrow.
///
/// Required env vars:
///   PM_NETWORK_DEPLOYER_PRIVATE_KEY - deployer private key
///   PM_NETWORK_DEPLOYER_ADDRESS     - deployer address (becomes owner)
///   COLLATERAL_TOKEN_ADDRESS        - WUSDe token address
///   PREDICTION_MARKET_ADDRESS       - existing PredictionMarketEscrow
///
/// Optional:
///   SPONSOR_BUDGET_MANAGER          - address allowed to set allocations
contract DeployCommittedIntent is Script {
    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address collateralToken = vm.envAddress("COLLATERAL_TOKEN_ADDRESS");
        address predictionEscrow = vm.envAddress("PREDICTION_MARKET_ADDRESS");
        address budgetManager = vm.envOr("SPONSOR_BUDGET_MANAGER", address(0));

        console.log("=== Deploy CommittedIntent stack ===");
        console.log("Owner:", deployer);
        console.log("Collateral Token:", collateralToken);
        console.log("Prediction Escrow:", predictionEscrow);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        // 1. Sponsor V2 (no dependency on executor address).
        OnboardingSponsorV2 sponsor =
            new OnboardingSponsorV2(collateralToken, deployer);
        console.log("ONBOARDING_SPONSOR_V2_ADDRESS=", address(sponsor));

        // 2. Compute the executor address up-front (nonce + 3): we'll deploy
        //    PreMintEscrow, CounterpartyVault, InsurancePool first (each takes
        //    the executor address as an immutable), then the executor.
        address execAddress =
            vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 3);
        console.log("Predicted executor address:", execAddress);

        PreMintEscrow preMint = new PreMintEscrow(collateralToken, execAddress);
        console.log("PRE_MINT_ESCROW_ADDRESS=", address(preMint));

        CounterpartyVault cpVault =
            new CounterpartyVault(collateralToken, execAddress);
        console.log("COUNTERPARTY_VAULT_ADDRESS=", address(cpVault));

        InsurancePool pool = new InsurancePool(collateralToken, execAddress);
        console.log("INSURANCE_POOL_ADDRESS=", address(pool));

        CommittedIntentExecutor exec = new CommittedIntentExecutor(
            collateralToken,
            address(preMint),
            address(cpVault),
            address(pool),
            predictionEscrow,
            address(sponsor)
        );
        require(address(exec) == execAddress, "executor nonce drift");
        console.log("COMMITTED_INTENT_EXECUTOR_ADDRESS=", address(exec));

        // 3. Wire the sponsor to trust the PreMintEscrow (it is the only
        //    contract that calls reserve/release/spend; the executor itself
        //    never touches the sponsor directly).
        sponsor.setTrustedCaller(address(preMint));
        if (budgetManager != address(0)) {
            sponsor.setBudgetManager(budgetManager);
        }

        // 4. Hand the existing prediction escrow the trusted mint router.
        //    Must be called by the escrow's current owner.
        PredictionMarketEscrow(predictionEscrow)
            .setTrustedMintRouter(address(exec));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Done ===");
        console.log("Remember to fund the sponsor + approve pre-mint escrow.");
    }
}
