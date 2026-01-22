// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PositionTokenBridge
} from "../../../v2/bridge/PositionTokenBridge.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge to Remote (Mainnet)
/// @notice Bridge position tokens from PM Network (Ethereal) to SM Network (Arbitrum)
/// @dev Uses PREDICTOR_PRIVATE_KEY to bridge predictor tokens
contract TestBridgeToRemote is Script {
    function run() external {
        address bridgeAddr = vm.envAddress("PM_NETWORK_BRIDGE_ADDRESS");
        address tokenAddr = vm.envAddress("PREDICTOR_TOKEN_ADDRESS");

        // Predictor bridges their own tokens
        uint256 predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        address predictor = vm.addr(predictorPk);

        // Amount to bridge (default 10 tokens, configurable)
        uint256 amount = vm.envOr("BRIDGE_AMOUNT", uint256(10 ether));

        // Optional: bridge to a different recipient
        address recipient = vm.envOr("BRIDGE_RECIPIENT", predictor);

        PositionTokenBridge bridge = PositionTokenBridge(payable(bridgeAddr));
        IERC20 token = IERC20(tokenAddr);

        console.log("=== Bridge Test: Ethereal -> Arbitrum (Mainnet) ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Token:", tokenAddr);
        console.log("Sender:", predictor);
        console.log("Recipient:", recipient);
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

        // Bridge
        bytes32 bridgeId = bridge.bridge{ value: fee.nativeFee }(
            tokenAddr,
            recipient,
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Initiated ===");
        console.log("BridgeId:", vm.toString(bridgeId));
        console.log("");
        console.log("Next steps:");
        console.log(
            "1. Wait for LayerZero message delivery (check confirmations)"
        );
        console.log("2. Check bridge status on SM Network (Arbitrum)");
        console.log("3. Track on https://layerzeroscan.com/");
    }
}
