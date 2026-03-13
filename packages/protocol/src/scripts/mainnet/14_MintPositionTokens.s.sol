// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";

/// @title Mint Prediction Market Tokens (Mainnet)
/// @notice Mint prediction market tokens via PredictionMarketEscrow for bridge testing
/// @dev Creates a prediction with separate predictor and counterparty addresses
contract MintPredictionMarketTokens is Script {
    // Bundle parameters to avoid stack too deep
    struct Actors {
        uint256 deployerPk;
        address deployer;
        uint256 predictorPk;
        address predictor;
        uint256 counterpartyPk;
        address counterparty;
    }

    struct Collaterals {
        uint256 predictorCollateral;
        uint256 counterpartyCollateral;
    }

    struct SignParams {
        PredictionMarketEscrow market;
        bytes32 predictionHash;
        uint256 deadline;
    }

    function run() external {
        Actors memory actors = _loadActors();

        // Configurable collateral amounts via env vars
        Collaterals memory collaterals;
        collaterals.predictorCollateral =
            vm.envOr("PREDICTOR_COLLATERAL", uint256(100 ether));
        collaterals.counterpartyCollateral = vm.envOr(
            "COUNTERPARTY_COLLATERAL", collaterals.predictorCollateral / 3
        );

        console.log(
            "=== Mint Prediction Market Tokens via PredictionMarketEscrow (Mainnet) ==="
        );
        console.log("Deployer (funder):", actors.deployer);
        console.log("Predictor:", actors.predictor);
        console.log("Counterparty:", actors.counterparty);
        console.log("Predictor Collateral:", collaterals.predictorCollateral);
        console.log(
            "Counterparty Collateral:", collaterals.counterpartyCollateral
        );

        // Execute mint
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken,
            bytes32 pickConfigId,
            bytes32 conditionId
        ) = _executeMint(actors, collaterals);

        console.log("");
        console.log("=== Minted Successfully ===");
        console.log("Prediction ID:", vm.toString(predictionId));
        console.log("Predictor Token:", predictorToken);
        console.log("Counterparty Token:", counterpartyToken);
        console.log("Pick Config ID:", vm.toString(pickConfigId));
        console.log("Condition ID:", vm.toString(conditionId));
        console.log("");
        console.log("Token Balances:");
        console.log(
            "  Predictor Token (predictor):",
            IERC20(predictorToken).balanceOf(actors.predictor)
        );
        console.log(
            "  Counterparty Token (counterparty):",
            IERC20(counterpartyToken).balanceOf(actors.counterparty)
        );
        console.log("");
        console.log("Add to .env:");
        console.log("PREDICTION_ID=", vm.toString(predictionId));
        console.log("PREDICTOR_TOKEN_ADDRESS=", predictorToken);
        console.log("COUNTERPARTY_TOKEN_ADDRESS=", counterpartyToken);
        console.log("PICK_CONFIG_ID=", vm.toString(pickConfigId));
        console.log("CONDITION_ID=", vm.toString(conditionId));
    }

    function _loadActors() internal view returns (Actors memory actors) {
        actors.deployerPk = vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY");
        actors.deployer = vm.addr(actors.deployerPk);
        actors.predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        actors.predictor = vm.addr(actors.predictorPk);
        actors.counterpartyPk = vm.envUint("COUNTERPARTY_PRIVATE_KEY");
        actors.counterparty = vm.addr(actors.counterpartyPk);
    }

    function _executeMint(Actors memory actors, Collaterals memory collaterals)
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken,
            bytes32 pickConfigId,
            bytes32 conditionId
        )
    {
        PredictionMarketEscrow market =
            PredictionMarketEscrow(vm.envAddress("PREDICTION_MARKET_ADDRESS"));
        IERC20 collateral = IERC20(vm.envAddress("COLLATERAL_TOKEN_ADDRESS"));
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");

        // Create unique condition ID (can be overridden via env)
        conditionId = vm.envOr(
            "CONDITION_ID",
            keccak256(abi.encode("mainnet-test-condition-", block.timestamp))
        );

        // Build pick and compute pickConfigId
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: resolverAddr,
            conditionId: abi.encode(conditionId),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        pickConfigId = keccak256(abi.encode(picks));

        // Build mint request with separate predictor and counterparty
        IV2Types.MintRequest memory request =
            _buildRequest(market, picks, actors, collaterals);

        // Deployer funds the collateral for both sides
        vm.startBroadcast(actors.deployerPk);
        collateral.transfer(actors.predictor, collaterals.predictorCollateral);
        collateral.transfer(
            actors.counterparty, collaterals.counterpartyCollateral
        );
        vm.stopBroadcast();

        // Predictor approves their collateral
        vm.startBroadcast(actors.predictorPk);
        collateral.approve(address(market), collaterals.predictorCollateral);
        vm.stopBroadcast();

        // Counterparty approves their collateral
        vm.startBroadcast(actors.counterpartyPk);
        collateral.approve(address(market), collaterals.counterpartyCollateral);
        vm.stopBroadcast();

        // Anyone can call mint (we use deployer)
        vm.startBroadcast(actors.deployerPk);
        (predictionId, predictorToken, counterpartyToken) = market.mint(request);
        vm.stopBroadcast();
    }

    function _buildRequest(
        PredictionMarketEscrow market,
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
                actors.counterparty,
                address(0),
                ""
            )
        );

        // Generate unique nonces (bitmap nonces — any unused nonce is valid)
        uint256 predictorNonce =
            uint256(keccak256(abi.encode(block.timestamp, "predictor")));
        uint256 counterpartyNonce =
            uint256(keccak256(abi.encode(block.timestamp, "counterparty")));

        // Setup sign params
        SignParams memory signParams = SignParams({
            market: market,
            predictionHash: predictionHash,
            deadline: block.timestamp + 1 hours
        });

        // Sign for predictor
        bytes memory predictorSig = _signPredictor(
            signParams, actors, collaterals.predictorCollateral, predictorNonce
        );

        // Sign for counterparty
        bytes memory counterpartySig = _signCounterparty(
            signParams,
            actors,
            collaterals.counterpartyCollateral,
            counterpartyNonce
        );

        request = IV2Types.MintRequest({
            picks: picks,
            predictorCollateral: collaterals.predictorCollateral,
            counterpartyCollateral: collaterals.counterpartyCollateral,
            predictor: actors.predictor,
            counterparty: actors.counterparty,
            predictorNonce: predictorNonce,
            counterpartyNonce: counterpartyNonce,
            predictorDeadline: signParams.deadline,
            counterpartyDeadline: signParams.deadline,
            predictorSignature: predictorSig,
            counterpartySignature: counterpartySig,
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

    function _signCounterparty(
        SignParams memory params,
        Actors memory actors,
        uint256 collateral,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = params.market
            .getMintApprovalHash(
                params.predictionHash,
                actors.counterparty,
                collateral,
                nonce,
                params.deadline
            );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(actors.counterpartyPk, approvalHash);
        return abi.encodePacked(r, s, v);
    }
}
