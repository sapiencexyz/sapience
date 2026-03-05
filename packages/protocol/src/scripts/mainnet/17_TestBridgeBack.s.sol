// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    PredictionMarketBridgeRemote
} from "../../bridge/PredictionMarketBridgeRemote.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";

/// @title Test Bridge Back (Mainnet)
/// @notice Bridge tokens from SM Network (Arbitrum) back to PM Network (Ethereal)
/// @dev Uses PREDICTOR_PRIVATE_KEY to bridge predictor tokens back
contract TestBridgeBack is Script {
    uint32 constant ETHEREAL_EID = 30_391;
    uint32 constant ARBITRUM_EID = 30_110;

    function run() external {
        address bridgeAddr = vm.envAddress("SM_NETWORK_BRIDGE_ADDRESS");
        bytes32 pickConfigId = vm.envBytes32("PICK_CONFIG_ID");
        bool isPredictorToken = vm.envOr("IS_PREDICTOR_TOKEN", true);

        // Predictor bridges their own tokens back
        uint256 predictorPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        address predictor = vm.addr(predictorPk);

        // Optional: bridge to a different recipient
        address recipient = vm.envOr("BRIDGE_RECIPIENT", predictor);

        PredictionMarketBridgeRemote bridge =
            PredictionMarketBridgeRemote(payable(bridgeAddr));

        // Get bridged token address
        address tokenAddr =
            bridge.getTokenAddress(pickConfigId, isPredictorToken);
        require(tokenAddr != address(0), "Token not deployed on remote");

        IERC20 token = IERC20(tokenAddr);
        uint256 balance = token.balanceOf(predictor);

        console.log("=== Bridge Test: Arbitrum -> Ethereal (Mainnet) ===");
        console.log("Bridge:", bridgeAddr);
        console.log("Bridged Token:", tokenAddr);
        console.log("Sender:", predictor);
        console.log("Recipient:", recipient);
        console.log("Is Predictor Token:", isPredictorToken);
        console.log("Current balance:", balance);

        require(balance > 0, "No bridged tokens to bridge back");

        // Amount to bridge (default: half the balance, configurable)
        uint256 amount = vm.envOr("BRIDGE_AMOUNT", balance / 2);
        if (amount == 0) amount = balance;
        console.log("Amount to bridge back:", amount);

        // Quote fee
        MessagingFee memory fee = bridge.quoteBridge(tokenAddr, amount);
        console.log("LZ Fee (native):", fee.nativeFee);

        vm.startBroadcast(predictorPk);

        // Approve
        token.approve(bridgeAddr, amount);
        console.log("Approved bridge to spend tokens");

        // Bridge back
        bytes32 bridgeId = bridge.bridge{ value: fee.nativeFee }(
            tokenAddr,
            recipient,
            amount,
            bytes32(0) // refCode
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== Bridge Back Initiated ===");
        console.log("Bridge ID:", vm.toString(bridgeId));
        console.log("");
        console.log("=== LayerZero Tracking ===");
        console.log("Source Chain EID:", ARBITRUM_EID);
        console.log("Destination Chain EID:", ETHEREAL_EID);
        console.log("OApp (sender):", bridgeAddr);
        console.log("");
        console.log(
            "NOTE: Use the transaction hash from forge output above to track on LayerZero Scan"
        );
        console.log("https://layerzeroscan.com/");
        console.log("");
        console.log("Add to .env for retry if needed:");
        console.log("BRIDGE_BACK_ID=", vm.toString(bridgeId));
    }
}
