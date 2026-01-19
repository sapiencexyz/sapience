// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {MockPositionToken} from "../../../../test/v2/mocks/MockPositionToken.sol";

/// @title Deploy Test Token
/// @notice Deploy MockPositionToken on Ethereal for testing
contract DeployTestToken is Script {
    function run() external {
        address recipient = vm.envAddress("DEPLOYER_ADDRESS");

        // Test pick configuration
        bytes32 pickConfigId = keccak256("test-prediction-v2-testnet");
        bool isPredictorToken = true;

        console.log("Deploying MockPositionToken on Ethereal...");
        console.log("Recipient:", recipient);
        console.log("PickConfigId:", vm.toString(pickConfigId));
        console.log("IsPredictorToken:", isPredictorToken);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        MockPositionToken token = new MockPositionToken(
            "Test Predictor Token",
            "TPRED",
            pickConfigId,
            isPredictorToken,
            recipient
        );

        vm.stopBroadcast();

        console.log("MockPositionToken deployed at:", address(token));
        console.log("Total supply:", token.totalSupply());
        console.log("Recipient balance:", token.balanceOf(recipient));
        console.log("");
        console.log("Add to .env:");
        console.log("TEST_TOKEN_ADDRESS=%s", address(token));
        console.log("PICK_CONFIG_ID=%s", vm.toString(pickConfigId));
    }
}
