// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../interfaces/IV2Types.sol";

contract DebugEncoding is Script {
    function run() external pure {
        console.log("=== Encoding Comparison ===");

        // Create a SessionKeyData struct in Solidity
        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: 0x83236e9D2170Ffe24Fb620c81AaCEF049116dA54,
            owner: 0xefA0E8Aa84A713f6A6d4De8cC761Fe86c5957d72,
            validUntil: 1_770_849_480,
            permissionsHash: 0xd9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c,
            chainId: 13_374_202,
            ownerSignature: hex"e716031e242e506e7faa4eb96f1909e7dd0696ac3be5cc73fbfdd4c89bce525a74c92b749ee63f11732d3da4777d50ddb910b7d66e8c446ce0ee3cc55e3d685d1b"
        });

        // Encode it using Solidity
        bytes memory solidityEncoded = abi.encode(skData);
        console.log("Solidity encoded length:", solidityEncoded.length);
        console.log("Solidity encoded:");
        console.logBytes(solidityEncoded);

        // Now the frontend's encoded data
        bytes memory frontendEncoded =
            hex"00000000000000000000000083236e9d2170ffe24fb620c81aacef049116da54000000000000000000000000efa0e8aa84a713f6a6d4de8cc761fe86c5957d7200000000000000000000000000000000000000000000000000000000698d04c8d9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c0000000000000000000000000000000000000000000000000000000000cc12fa00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000041e716031e242e506e7faa4eb96f1909e7dd0696ac3be5cc73fbfdd4c89bce525a74c92b749ee63f11732d3da4777d50ddb910b7d66e8c446ce0ee3cc55e3d685d1b00000000000000000000000000000000000000000000000000000000000000";

        console.log("\nFrontend encoded length:", frontendEncoded.length);

        // Compare
        console.log("\nComparing...");
        if (solidityEncoded.length != frontendEncoded.length) {
            console.log("LENGTH MISMATCH!");
        }

        bool match_ = true;
        for (
            uint256 i = 0;
            i < solidityEncoded.length && i < frontendEncoded.length;
            i++
        ) {
            if (solidityEncoded[i] != frontendEncoded[i]) {
                console.log("Mismatch at byte:", i);
                console.log("Solidity:", uint8(solidityEncoded[i]));
                console.log("Frontend:", uint8(frontendEncoded[i]));
                match_ = false;
                break;
            }
        }

        if (match_ && solidityEncoded.length == frontendEncoded.length) {
            console.log("ENCODINGS MATCH!");
        }
    }
}
