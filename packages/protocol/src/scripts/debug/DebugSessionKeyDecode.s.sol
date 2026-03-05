// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../interfaces/IV2Types.sol";

contract DebugSessionKeyDecode is Script {
    function run() external pure {
        console.log("=== SessionKeyData Decode Test ===");

        // Raw bytes from UserOp
        bytes memory sessionKeyData =
            hex"00000000000000000000000083236e9d2170ffe24fb620c81aacef049116da54000000000000000000000000efa0e8aa84a713f6a6d4de8cc761fe86c5957d7200000000000000000000000000000000000000000000000000000000698d04c8d9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c0000000000000000000000000000000000000000000000000000000000cc12fa00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000041e716031e242e506e7faa4eb96f1909e7dd0696ac3be5cc73fbfdd4c89bce525a74c92b749ee63f11732d3da4777d50ddb910b7d66e8c446ce0ee3cc55e3d685d1b00000000000000000000000000000000000000000000000000000000000000";

        console.log("Data length:", sessionKeyData.length);

        // Try to decode
        console.log("Attempting abi.decode...");
        IV2Types.SessionKeyData memory skData =
            abi.decode(sessionKeyData, (IV2Types.SessionKeyData));

        console.log("Decode succeeded!");
        console.log("  sessionKey:", skData.sessionKey);
        console.log("  owner:", skData.owner);
        console.log("  validUntil:", skData.validUntil);
        console.log("  chainId:", skData.chainId);
    }
}
