// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge to Remote
/// @notice Bridge position tokens from PM Network to SM Network
/// @dev Uses PREDICTOR_PRIVATE_KEY to bridge predictor tokens
contract TestBridgeToRemote is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address tokenAddr = vm.envAddress("PREDICTOR_TOKEN_ADDRESS");

        // Predictor bridges their own tokens
        uint256 predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        address predictor = vm.addr(predictorPk);

        uint256 amount = vm.envOr("BRIDGE_AMOUNT", uint256(10 ether)); // Default 10 tokens

        PredictionMarketBridge bridge =
            PredictionMarketBridge(payable(bridgeAddr));
        IERC20 token = IERC20(tokenAddr);

        console.log("=== Bridge Test: PM Network -> SM Network ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Token:", tokenAddr);
        console.log("Predictor (sender):", predictor);
        console.log("Amount:", amount);

        // Check balance
        uint256 balance = token.balanceOf(predictor);
        console.log("Current balance:", balance);
        require(balance >= amount, "Insufficient token balance");

        // Quote fee
        MessagingFee memory fee = bridge.quoteBridge(tokenAddr, amount);
        console.log("LZ Fee (native):", fee.nativeFee);

        vm.startBroadcast(predictorPk);

        // Approve
        token.approve(bridgeAddr, amount);
        console.log("Approved bridge to spend tokens");

        // Bridge - predictor sends to themselves on SM Network
        bytes32 bridgeId = bridge.bridge{ value: fee.nativeFee }(
            tokenAddr,
            predictor, // recipient on SM Network
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Initiated ===");
        console.log("BridgeId:", vm.toString(bridgeId));
        console.log("");
        console.log("Next steps:");
        console.log("1. Wait 1-2 minutes for LayerZero message delivery");
        console.log("2. Check bridge status on SM Network");
        console.log("3. Track on https://testnet.layerzeroscan.com/");
    }
}
