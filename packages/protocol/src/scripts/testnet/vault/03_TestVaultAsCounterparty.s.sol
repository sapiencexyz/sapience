// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketVault
} from "../../../vault/PredictionMarketVault.sol";
import { PredictionMarketEscrow } from "../../../PredictionMarketEscrow.sol";
import { IV2Types } from "../../../interfaces/IV2Types.sol";

/// @title Test Vault as Counterparty (Testnet)
/// @notice Tests vault acting as counterparty in PredictionMarketEscrow
/// @dev Manager signs on behalf of vault via ERC-1271
contract TestVaultAsCounterparty is Script {
    struct Actors {
        uint256 deployerPk;
        address deployer;
        uint256 predictorPk;
        address predictor;
        uint256 counterpartyPk;
        address counterparty; // This is the manager
    }

    struct Collaterals {
        uint256 predictorCollateral;
        uint256 counterpartyCollateral;
    }

    struct SignParams {
        PredictionMarketEscrow market;
        PredictionMarketVault vault;
        bytes32 predictionHash;
        uint256 deadline;
    }

    struct MintResult {
        bytes32 predictionId;
        address predictorToken;
        address counterpartyToken;
        bytes32 conditionId;
        bytes32 pickConfigId;
    }

    // State variables to avoid stack too deep
    PredictionMarketVault internal _vault;
    PredictionMarketEscrow internal _market;
    IERC20 internal _collateral;

    function run() external {
        Actors memory actors = _loadActors();

        _vault = PredictionMarketVault(vm.envAddress("VAULT_ADDRESS"));
        _market =
            PredictionMarketEscrow(vm.envAddress("PREDICTION_MARKET_ADDRESS"));
        _collateral = IERC20(vm.envAddress("COLLATERAL_TOKEN_ADDRESS"));

        // Configurable collateral amounts (default 0.002 WUSDe for testnet)
        Collaterals memory collaterals;
        collaterals.predictorCollateral =
            vm.envOr("PREDICTOR_COLLATERAL", uint256(0.002 ether));
        collaterals.counterpartyCollateral =
            vm.envOr("COUNTERPARTY_COLLATERAL", uint256(0.0006 ether));

        _logSetup(actors, collaterals);

        // Check initial state
        uint256 vaultBalanceBefore = _collateral.balanceOf(address(_vault));

        // Step 1: Manager approves funds
        _approveFunds(actors, collaterals);

        // Step 2-4: Build request, fund predictor, and mint
        MintResult memory result =
            _executeMint(actors, collaterals, vaultBalanceBefore);

        // Log output
        _logResults(result);
    }

    function _logSetup(Actors memory actors, Collaterals memory collaterals)
        internal
        view
    {
        console.log("=== Test Vault as Counterparty (Testnet) ===");
        console.log("Vault:", address(_vault));
        console.log("Vault Manager:", _vault.manager());
        console.log("Market:", address(_market));
        console.log("Predictor:", actors.predictor);
        console.log("Predictor Collateral:", collaterals.predictorCollateral);
        console.log(
            "Counterparty Collateral:", collaterals.counterpartyCollateral
        );
        console.log("");
        console.log("=== Initial State ===");
        console.log("Vault Collateral:", _collateral.balanceOf(address(_vault)));
        console.log(
            "Predictor Collateral:", _collateral.balanceOf(actors.predictor)
        );
    }

    function _approveFunds(Actors memory actors, Collaterals memory collaterals)
        internal
    {
        console.log("");
        console.log("=== Step 1: Manager approves funds ===");

        vm.startBroadcast(actors.counterpartyPk);
        _vault.approveFundsUsage(
            address(_market), collaterals.counterpartyCollateral
        );
        vm.stopBroadcast();

        console.log(
            "Approved", collaterals.counterpartyCollateral, "for market"
        );
    }

    function _executeMint(
        Actors memory actors,
        Collaterals memory collaterals,
        uint256 vaultBalanceBefore
    ) internal returns (MintResult memory result) {
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");

        console.log("");
        console.log("=== Step 2: Build MintRequest ===");

        // Create unique condition ID
        result.conditionId = vm.envOr(
            "CONDITION_ID",
            keccak256(abi.encode("vault-counterparty-test-", block.timestamp))
        );

        // Build pick
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: resolverAddr,
            conditionId: abi.encode(result.conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        result.pickConfigId = keccak256(abi.encode(picks));

        IV2Types.MintRequest memory request =
            _buildRequest(_market, _vault, picks, actors, collaterals);

        console.log("Condition ID:", vm.toString(result.conditionId));

        // Step 3: Fund predictor and approve
        _fundAndApprove(actors, collaterals);

        // Step 4: Mint prediction
        console.log("");
        console.log("=== Step 4: Mint prediction ===");

        vm.startBroadcast(actors.deployerPk);
        (result.predictionId, result.predictorToken, result.counterpartyToken) =
            _market.mint(request);
        vm.stopBroadcast();

        console.log("Prediction minted!");

        // Verify
        _verifyMint(result, actors, collaterals, vaultBalanceBefore);
    }

    function _fundAndApprove(
        Actors memory actors,
        Collaterals memory collaterals
    ) internal {
        console.log("");
        console.log("=== Step 3: Fund and approve ===");

        // Deployer funds predictor if needed
        if (
            _collateral.balanceOf(actors.predictor)
                < collaterals.predictorCollateral
        ) {
            vm.startBroadcast(actors.deployerPk);
            _collateral.transfer(
                actors.predictor, collaterals.predictorCollateral
            );
            vm.stopBroadcast();
            console.log(
                "Funded predictor with", collaterals.predictorCollateral
            );
        }

        // Predictor approves market
        vm.startBroadcast(actors.predictorPk);
        _collateral.approve(address(_market), collaterals.predictorCollateral);
        vm.stopBroadcast();

        console.log("Predictor approved market");
    }

    function _verifyMint(
        MintResult memory result,
        Actors memory actors,
        Collaterals memory collaterals,
        uint256 vaultBalanceBefore
    ) internal view {
        console.log("");
        console.log("=== Verification ===");

        uint256 vaultBalanceAfter = _collateral.balanceOf(address(_vault));
        uint256 predictorTokenBalance =
            IERC20(result.predictorToken).balanceOf(actors.predictor);
        uint256 vaultCounterpartyTokenBalance =
            IERC20(result.counterpartyToken).balanceOf(address(_vault));

        console.log("Vault Collateral After:", vaultBalanceAfter);
        console.log("Predictor Token Balance:", predictorTokenBalance);
        console.log(
            "Vault Counterparty Token Balance:", vaultCounterpartyTokenBalance
        );

        require(
            vaultBalanceAfter
                == vaultBalanceBefore - collaterals.counterpartyCollateral,
            "Vault collateral not deducted"
        );
        // Use >= to allow for accumulated balances from previous test runs
        require(
            predictorTokenBalance >= collaterals.predictorCollateral,
            "Predictor tokens not minted"
        );
        require(
            vaultCounterpartyTokenBalance >= collaterals.counterpartyCollateral,
            "Vault counterparty tokens not minted"
        );

        console.log("");
        console.log("=== Test Passed ===");
        console.log("Vault successfully acted as counterparty!");
    }

    function _logResults(MintResult memory result) internal pure {
        console.log("");
        console.log("Add to .env:");
        console.log("PREDICTION_ID=", vm.toString(result.predictionId));
        console.log("PREDICTOR_TOKEN_ADDRESS=", result.predictorToken);
        console.log("COUNTERPARTY_TOKEN_ADDRESS=", result.counterpartyToken);
        console.log("CONDITION_ID=", vm.toString(result.conditionId));
        console.log("PICK_CONFIG_ID=", vm.toString(result.pickConfigId));
    }

    function _loadActors() internal view returns (Actors memory actors) {
        actors.deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        actors.deployer = vm.addr(actors.deployerPk);
        actors.predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        actors.predictor = vm.addr(actors.predictorPk);
        actors.counterpartyPk = vm.envUint("COUNTERPARTY_PRIVATE_KEY");
        actors.counterparty = vm.addr(actors.counterpartyPk);
    }

    function _buildRequest(
        PredictionMarketEscrow market,
        PredictionMarketVault vault,
        IV2Types.Pick[] memory picks,
        Actors memory actors,
        Collaterals memory collaterals
    ) internal view returns (IV2Types.MintRequest memory request) {
        // Compute prediction hash
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                collaterals.predictorCollateral,
                collaterals.counterpartyCollateral,
                actors.predictor,
                address(vault),
                address(0),
                ""
            )
        );

        // Generate unique nonces (bitmap nonces — any unused nonce is valid)
        uint256 predictorNonce =
            uint256(keccak256(abi.encode(block.timestamp, "predictor")));
        uint256 vaultNonce =
            uint256(keccak256(abi.encode(block.timestamp, "vault")));
        uint256 deadline = block.timestamp + 1 hours;

        // Setup sign params
        SignParams memory signParams = SignParams({
            market: market,
            vault: vault,
            predictionHash: predictionHash,
            deadline: deadline
        });

        // Sign for predictor (EOA signature)
        bytes memory predictorSig = _signPredictor(
            signParams, actors, collaterals.predictorCollateral, predictorNonce
        );

        // Sign for vault (manager signs via ERC-1271)
        bytes memory vaultSig = _signVaultApproval(
            signParams, actors, collaterals.counterpartyCollateral, vaultNonce
        );

        request = IV2Types.MintRequest({
            picks: picks,
            predictorCollateral: collaterals.predictorCollateral,
            counterpartyCollateral: collaterals.counterpartyCollateral,
            predictor: actors.predictor,
            counterparty: address(vault),
            predictorNonce: predictorNonce,
            counterpartyNonce: vaultNonce,
            predictorDeadline: deadline,
            counterpartyDeadline: deadline,
            predictorSignature: predictorSig,
            counterpartySignature: vaultSig,
            refCode: bytes32(0),
            predictorSessionKeyData: "",
            counterpartySessionKeyData: "",
            predictorSponsor: address(0),
            predictorSponsorData: ""
        });
    }

    function _signPredictor(
        SignParams memory params,
        Actors memory actors,
        uint256 collateral,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = params.market
            .getMintApprovalHash(
                params.predictionHash,
                actors.predictor,
                collateral,
                nonce,
                params.deadline
            );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(actors.predictorPk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _signVaultApproval(
        SignParams memory params,
        Actors memory actors,
        uint256 collateral,
        uint256 nonce
    ) internal view returns (bytes memory) {
        // Step 1: Get the mint approval hash that the market will pass to vault.isValidSignature
        bytes32 mintApprovalHash = params.market
            .getMintApprovalHash(
                params.predictionHash,
                address(params.vault),
                collateral,
                nonce,
                params.deadline
            );

        // Step 2: Get the hash that the manager needs to sign
        // The vault wraps the mint approval hash with the manager address
        bytes32 vaultApprovalHash =
            params.vault.getApprovalHash(mintApprovalHash, actors.counterparty);

        // Step 3: Manager signs the vault approval hash
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(actors.counterpartyPk, vaultApprovalHash);

        return abi.encodePacked(r, s, v);
    }
}
