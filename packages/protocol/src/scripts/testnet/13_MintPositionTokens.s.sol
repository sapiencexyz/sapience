// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";

/// @title Mint Prediction Market Tokens
/// @notice Mint prediction market tokens via PredictionMarketEscrow for bridge testing
/// @dev Creates a prediction with separate predictor and counterparty addresses
contract MintPredictionMarketTokens is Script {
    // Collateral amounts (different for predictor and counterparty)
    uint256 constant PREDICTOR_COLLATERAL = 0.001 ether;
    uint256 constant COUNTERPARTY_COLLATERAL = 0.000_33 ether;

    // Bundle parameters to avoid stack too deep
    struct Actors {
        uint256 deployerPk;
        address deployer;
        uint256 predictorPk;
        address predictor;
        uint256 counterpartyPk;
        address counterparty;
    }

    function run() external {
        Actors memory actors = _loadActors();

        console.log(
            "=== Mint Prediction Market Tokens via PredictionMarketEscrow ==="
        );
        console.log("Deployer (funder):", actors.deployer);
        console.log("Predictor:", actors.predictor);
        console.log("Counterparty:", actors.counterparty);
        console.log("Predictor Collateral:", PREDICTOR_COLLATERAL);
        console.log("Counterparty Collateral:", COUNTERPARTY_COLLATERAL);

        // Execute mint
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken,
            bytes32 pickConfigId,
            bytes32 conditionId
        ) = _executeMint(actors);

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
        console.log("PREDICTOR_TOKEN_ADDRESS=", predictorToken);
        console.log("COUNTERPARTY_TOKEN_ADDRESS=", counterpartyToken);
        console.log("PICK_CONFIG_ID=", vm.toString(pickConfigId));
        console.log("CONDITION_ID=", vm.toString(conditionId));
    }

    function _loadActors() internal view returns (Actors memory actors) {
        actors.deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        actors.deployer = vm.addr(actors.deployerPk);
        actors.predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        actors.predictor = vm.addr(actors.predictorPk);
        actors.counterpartyPk = vm.envUint("COUNTERPARTY_PRIVATE_KEY");
        actors.counterparty = vm.addr(actors.counterpartyPk);
    }

    function _executeMint(Actors memory actors)
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

        // Create unique condition ID
        conditionId = keccak256(abi.encode("test-condition-", block.timestamp));

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
            _buildRequest(market, picks, actors);

        // Deployer funds the collateral only if needed
        uint256 predictorBal = collateral.balanceOf(actors.predictor);
        uint256 counterpartyBal = collateral.balanceOf(actors.counterparty);

        if (
            predictorBal < PREDICTOR_COLLATERAL
                || counterpartyBal < COUNTERPARTY_COLLATERAL
        ) {
            vm.startBroadcast(actors.deployerPk);
            if (predictorBal < PREDICTOR_COLLATERAL) {
                collateral.transfer(
                    actors.predictor, PREDICTOR_COLLATERAL - predictorBal
                );
            }
            if (counterpartyBal < COUNTERPARTY_COLLATERAL) {
                collateral.transfer(
                    actors.counterparty,
                    COUNTERPARTY_COLLATERAL - counterpartyBal
                );
            }
            vm.stopBroadcast();
        }

        // Predictor approves their collateral
        vm.startBroadcast(actors.predictorPk);
        collateral.approve(address(market), PREDICTOR_COLLATERAL);
        vm.stopBroadcast();

        // Counterparty approves their collateral
        vm.startBroadcast(actors.counterpartyPk);
        collateral.approve(address(market), COUNTERPARTY_COLLATERAL);
        vm.stopBroadcast();

        // Anyone can call mint (we use deployer)
        vm.startBroadcast(actors.deployerPk);
        (predictionId, predictorToken, counterpartyToken) = market.mint(request);
        vm.stopBroadcast();
    }

    function _buildRequest(
        PredictionMarketEscrow market,
        IV2Types.Pick[] memory picks,
        Actors memory actors
    ) internal view returns (IV2Types.MintRequest memory request) {
        // Compute prediction hash
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(
            abi.encode(
                pickConfigId,
                PREDICTOR_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
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
        uint256 deadline = block.timestamp + 1 hours;

        // Sign for predictor
        bytes memory predictorSig = _sign(
            market,
            predictionHash,
            actors.predictor,
            PREDICTOR_COLLATERAL,
            predictorNonce,
            deadline,
            actors.predictorPk
        );

        // Sign for counterparty
        bytes memory counterpartySig = _sign(
            market,
            predictionHash,
            actors.counterparty,
            COUNTERPARTY_COLLATERAL,
            counterpartyNonce,
            deadline,
            actors.counterpartyPk
        );

        request = IV2Types.MintRequest({
            picks: picks,
            predictorCollateral: PREDICTOR_COLLATERAL,
            counterpartyCollateral: COUNTERPARTY_COLLATERAL,
            predictor: actors.predictor,
            counterparty: actors.counterparty,
            predictorNonce: predictorNonce,
            counterpartyNonce: counterpartyNonce,
            predictorDeadline: deadline,
            counterpartyDeadline: deadline,
            predictorSignature: predictorSig,
            counterpartySignature: counterpartySig,
            refCode: bytes32(0),
            predictorSessionKeyData: "",
            counterpartySessionKeyData: "",
            predictorSponsor: address(0),
            predictorSponsorData: ""
        });
    }

    function _sign(
        PredictionMarketEscrow market,
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }
}
