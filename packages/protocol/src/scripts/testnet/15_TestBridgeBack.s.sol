// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge Back
/// @notice Bridge tokens from SM Network back to PM Network
/// @dev Uses PREDICTOR_PRIVATE_KEY to bridge predictor tokens back
contract TestBridgeBack is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        bytes32 pickConfigId = vm.envBytes32("PICK_CONFIG_ID");
        bool isPredictorToken = true;

        // Predictor bridges their own tokens back
        uint256 predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        address predictor = vm.addr(predictorPk);

        PredictionMarketBridgeRemote bridge =
            PredictionMarketBridgeRemote(payable(bridgeAddr));

        console.log("=== Bridge Test: SM Network -> PM Network ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Pick Config ID:", vm.toString(pickConfigId));
        console.log("Predictor (sender):", predictor);

        // Check if token is deployed (bridge from PM->SM must have completed first)
        bool isDeployed = bridge.isTokenDeployed(pickConfigId, isPredictorToken);
        if (!isDeployed) {
            console.log("");
            console.log("ERROR: Bridged token not yet deployed on SM Network!");
            console.log(
                "This means the bridge from PM Network -> SM Network has not completed."
            );
            console.log("");
            console.log("Please:");
            console.log("1. Check if bridge was initiated on PM Network");
            console.log("2. Wait for LayerZero message delivery (1-5 minutes)");
            console.log("3. Track on https://testnet.layerzeroscan.com/");
            revert("Token not deployed - bridge from PM Network not completed");
        }

        // Get bridged token address
        address tokenAddr =
            bridge.getTokenAddress(pickConfigId, isPredictorToken);

        IERC20 token = IERC20(tokenAddr);
        uint256 balance = token.balanceOf(predictor);

        console.log("Bridged Token:", tokenAddr);
        console.log("Current balance:", balance);

        require(balance > 0, "No bridged tokens to bridge back");

        // Bridge back half the balance
        uint256 amount = balance / 2;
        if (amount == 0) amount = balance;
        console.log("Amount to bridge back:", amount);

        // Quote fee
        MessagingFee memory fee = bridge.quoteBridge(tokenAddr, amount);
        console.log("LZ Fee (native):", fee.nativeFee);

        vm.startBroadcast(predictorPk);

        // Approve
        token.approve(bridgeAddr, amount);
        console.log("Approved bridge to spend tokens");

        // Bridge back - predictor sends to themselves on PM Network
        bytes32 bridgeId = bridge.bridge{ value: fee.nativeFee }(
            tokenAddr,
            predictor, // recipient on PM Network
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Back Initiated ===");
        console.log("BridgeId:", vm.toString(bridgeId));
        console.log("");
        console.log("Next steps:");
        console.log("1. Wait 1-2 minutes for LayerZero message delivery");
        console.log("2. Check token balance on PM Network");
        console.log("3. Track on https://testnet.layerzeroscan.com/");
    }
}
