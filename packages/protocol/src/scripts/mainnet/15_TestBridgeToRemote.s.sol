// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridge
} from "../../bridge/PredictionMarketBridge.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge to Remote (Mainnet)
/// @notice Bridge position tokens from PM Network (Ethereal) to SM Network (Arbitrum)
/// @dev Uses PREDICTOR_PRIVATE_KEY to bridge predictor tokens
contract TestBridgeToRemote is Script {
    uint32 constant ETHEREAL_EID = 30_391;
    uint32 constant ARBITRUM_EID = 30_110;

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

        PredictionMarketBridge bridge =
            PredictionMarketBridge(payable(bridgeAddr));
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
        console.log("Bridge ID:", vm.toString(bridgeId));
        console.log("");
        console.log("=== LayerZero Tracking ===");
        console.log("Source Chain EID:", ETHEREAL_EID);
        console.log("Destination Chain EID:", ARBITRUM_EID);
        console.log("OApp (sender):", bridgeAddr);
        console.log("");
        console.log(
            "NOTE: Use the transaction hash from forge output above to track on LayerZero Scan"
        );
        console.log("https://layerzeroscan.com/");
        console.log("");
        console.log("Add to .env for retry if needed:");
        console.log("BRIDGE_ID=", vm.toString(bridgeId));
    }
}
