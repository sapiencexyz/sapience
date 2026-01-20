// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PredictionMarketV2} from "../../../v2/PredictionMarketV2.sol";
import {IV2Types} from "../../../v2/interfaces/IV2Types.sol";

/// @title Mint Position Tokens
/// @notice Mint position tokens via PredictionMarketV2 for bridge testing
/// @dev Creates a prediction with the deployer as both predictor and counterparty
contract MintPositionTokens is Script {
    // Wager amounts
    uint256 constant WAGER = 100 ether; // 100 tokens each side

    function run() external {
        // Load basic config
        uint256 deployerPk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPk);

        console.log("=== Mint Position Tokens via PredictionMarketV2 ===");
        console.log("Deployer:", deployer);
        console.log("Wager per side:", WAGER);

        // Execute mint
        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken,
            bytes32 pickConfigId,
            bytes32 conditionId
        ) = _executeMint(deployerPk, deployer);

        console.log("");
        console.log("=== Minted Successfully ===");
        console.log("Prediction ID:", vm.toString(predictionId));
        console.log("Predictor Token:", predictorToken);
        console.log("Counterparty Token:", counterpartyToken);
        console.log("Pick Config ID:", vm.toString(pickConfigId));
        console.log("Condition ID:", vm.toString(conditionId));
        console.log("");
        console.log("Token Balances:");
        console.log("  Predictor Token:", IERC20(predictorToken).balanceOf(deployer));
        console.log("  Counterparty Token:", IERC20(counterpartyToken).balanceOf(deployer));
        console.log("");
        console.log("Add to .env:");
        console.log("PREDICTOR_TOKEN_ADDRESS=", predictorToken);
        console.log("COUNTERPARTY_TOKEN_ADDRESS=", counterpartyToken);
        console.log("PICK_CONFIG_ID=", vm.toString(pickConfigId));
        console.log("CONDITION_ID=", vm.toString(conditionId));
    }

    function _executeMint(uint256 deployerPk, address deployer)
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken,
            bytes32 pickConfigId,
            bytes32 conditionId
        )
    {
        PredictionMarketV2 market = PredictionMarketV2(vm.envAddress("PREDICTION_MARKET_ADDRESS"));
        IERC20 collateral = IERC20(vm.envAddress("COLLATERAL_TOKEN_ADDRESS"));
        address resolverAddr = vm.envAddress("RESOLVER_ADDRESS");

        // Create unique condition ID
        conditionId = keccak256(abi.encode("test-condition-", block.timestamp));

        // Build pick and compute pickConfigId
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: resolverAddr, conditionId: conditionId, predictedOutcome: IV2Types.OutcomeSide.YES
        });
        pickConfigId = keccak256(abi.encode(picks));

        // Build mint request
        IV2Types.MintRequest memory request = _buildRequest(market, picks, deployer, deployerPk);

        vm.startBroadcast(deployerPk);

        // Approve and mint
        collateral.approve(address(market), WAGER * 2);
        (predictionId, predictorToken, counterpartyToken) = market.mint(request);

        vm.stopBroadcast();
    }

    function _buildRequest(
        PredictionMarketV2 market,
        IV2Types.Pick[] memory picks,
        address deployer,
        uint256 deployerPk
    ) internal view returns (IV2Types.MintRequest memory request) {
        // Compute prediction hash
        bytes32 pickConfigId = keccak256(abi.encode(picks));
        bytes32 predictionHash = keccak256(abi.encode(pickConfigId, WAGER, WAGER, deployer, deployer));

        // Get nonces and deadline
        uint256 nonce = market.getNonce(deployer);
        uint256 deadline = block.timestamp + 1 hours;

        // Sign (same sig for both since same signer)
        bytes memory sig = _sign(market, predictionHash, deployer, WAGER, nonce, deadline, deployerPk);

        request = IV2Types.MintRequest({
            picks: picks,
            predictorWager: WAGER,
            counterpartyWager: WAGER,
            predictor: deployer,
            counterparty: deployer,
            predictorNonce: nonce,
            counterpartyNonce: nonce,
            predictorDeadline: deadline,
            counterpartyDeadline: deadline,
            predictorSignature: sig,
            counterpartySignature: sig,
            refCode: bytes32(0),
            predictorSessionKeyData: "",
            counterpartySessionKeyData: ""
        });
    }

    function _sign(
        PredictionMarketV2 market,
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(predictionHash, signer, wager, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }
}
