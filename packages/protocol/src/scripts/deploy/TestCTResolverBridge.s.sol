// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {
    ConditionalTokensReader
} from "../../resolvers/conditionalTokens/ConditionalTokensReader.sol";
import {
    IConditionalTokensReader
} from "../../resolvers/conditionalTokens/interfaces/IConditionalTokensReader.sol";

/// @title Test CT Resolver Bridge
/// @notice Sends a requestResolution from ConditionalTokensReader (Polygon) to
///         ConditionalTokensConditionResolver (Ethereal) via LayerZero.
///
/// Usage:
///   1. Run this script on Polygon to request resolution:
///
///      CONDITION_ID=0x... forge script \
///        src/scripts/mainnet/TestCTResolverBridge.s.sol:TestCTResolverBridge \
///        --rpc-url $POLYGON_RPC_URL --broadcast
///
///   2. Wait ~1-2 min for LayerZero delivery, then check on Ethereal:
///
///      cast call $CT_CONDITION_RESOLVER_ADDRESS \
///        "getCondition(bytes32)((bytes32,bool,bool,bool,bool,uint256,uint256,uint256,uint64))" \
///        $CONDITION_ID --rpc-url $PM_NETWORK_RPC_URL
///
/// Env vars:
///   POLYGON_DEPLOYER_PRIVATE_KEY  - Private key of the caller (needs POL for gas + LZ fee)
///   CT_READER_ADDRESS             - ConditionalTokensReader on Polygon
///   CONDITION_ID                  - The Gnosis CT conditionId to resolve
contract TestCTResolverBridge is Script {
    function run() external {
        uint256 callerPk = vm.envUint("POLYGON_DEPLOYER_PRIVATE_KEY");
        address caller = vm.addr(callerPk);

        address readerAddr = vm.envAddress("CT_READER_ADDRESS");
        bytes32 conditionId = vm.envBytes32("CONDITION_ID");

        ConditionalTokensReader reader =
            ConditionalTokensReader(payable(readerAddr));

        console.log("=== Test CT Resolver Bridge ===");
        console.log("Reader (Polygon):", readerAddr);
        console.log("Caller:", caller);
        console.log("Condition ID:", vm.toString(conditionId));

        // Check if the condition can be resolved
        bool canRequest = reader.canRequestResolution(conditionId);
        console.log("Can request resolution:", canRequest);
        require(
            canRequest,
            "Condition cannot be resolved (not binary, not resolved on CT, or invalid)"
        );

        // Read condition data from Gnosis CT
        IConditionalTokensReader.ConditionData memory data =
            reader.getConditionResolution(conditionId);
        console.log("Payout denominator:", data.payoutDenominator);
        console.log("No payout:", data.noPayout);
        console.log("Yes payout:", data.yesPayout);
        console.log("Slot count:", data.slotCount);

        // Quote the LZ fee
        MessagingFee memory fee = reader.quoteResolution(conditionId);
        console.log("LZ fee (native POL):", fee.nativeFee);

        // Check caller balance covers fee
        uint256 balance = caller.balance;
        console.log("Caller balance:", balance);
        require(balance > fee.nativeFee, "Insufficient POL for LZ fee");

        // Send requestResolution with value to cover LZ fee
        vm.startBroadcast(callerPk);
        reader.requestResolution{ value: fee.nativeFee }(conditionId);
        vm.stopBroadcast();

        console.log("");
        console.log("=== Resolution Requested ===");
        console.log("Use the tx hash above to track on LayerZero Scan:");
        console.log("https://layerzeroscan.com/");
        console.log("");
        console.log("After delivery (~1-2 min), check on Ethereal:");
        console.log("  cast call <CT_CONDITION_RESOLVER_ADDRESS> \\");
        console.log(
            "    \"getCondition(bytes32)((bytes32,bool,bool,bool,bool,uint256,uint256,uint256,uint64))\" \\"
        );
        console.log("    ", vm.toString(conditionId), " \\");
        console.log("    --rpc-url $PM_NETWORK_RPC_URL");
    }
}
