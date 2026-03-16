// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../../interfaces/IPredictionMarketEscrow.sol";
import "../../interfaces/IV2Types.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DebugV2MintCall
 * @notice Actually simulates the mint call to find the exact revert reason
 *
 * Run with:
 * forge script script/DebugV2MintCall.s.sol --rpc-url https://rpc.etherealtest.net --fork-block-number 2202000 -vvvv
 */
contract DebugV2MintCall is Script {
    // Contract addresses on Ethereal testnet
    address constant ESCROW = 0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1;
    address constant WUSDE = 0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90;
    address constant PREDICTOR = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9; // SmartAccount
    address constant COUNTERPARTY = 0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B; // EOA
    address constant RESOLVER = 0x514A4321d89Aa47D1b1Dd9E0a3226249E6ef896A;

    function run() external {
        console.log("=== V2 Mint Call Simulation ===");
        console.log("Block timestamp:", block.timestamp);

        // First, simulate deposit + approve as the SmartAccount
        // This mimics what the UserOp batch would do

        uint256 predictorCollateral = 5_100_000_000_000_000; // 0.0051 USDe
        uint256 counterpartyCollateral = 10_000_000_000_000_000; // 0.01 USDe

        console.log("\n--- Step 1: Check SmartAccount native balance ---");
        uint256 nativeBalance = PREDICTOR.balance;
        console.log("SmartAccount native balance:", nativeBalance);
        console.log("Amount needed for wrap:", predictorCollateral);

        if (nativeBalance < predictorCollateral) {
            console.log("!!! INSUFFICIENT NATIVE BALANCE FOR WRAP !!!");
            return;
        }

        // Simulate the calls as if we were the SmartAccount
        vm.startPrank(PREDICTOR);

        console.log("\n--- Step 2: Wrap native USDe to wUSDe ---");
        (bool wrapSuccess,) = WUSDE.call{ value: predictorCollateral }(
            abi.encodeWithSignature("deposit()")
        );
        console.log("Wrap success:", wrapSuccess);

        if (!wrapSuccess) {
            console.log("!!! WRAP FAILED !!!");
            vm.stopPrank();
            return;
        }

        uint256 wusdeBalance = IERC20(WUSDE).balanceOf(PREDICTOR);
        console.log("wUSDe balance after wrap:", wusdeBalance);

        console.log("\n--- Step 3: Approve escrow to spend wUSDe ---");
        bool approveSuccess = IERC20(WUSDE).approve(ESCROW, predictorCollateral);
        console.log("Approve success:", approveSuccess);

        uint256 allowance = IERC20(WUSDE).allowance(PREDICTOR, ESCROW);
        console.log("Allowance after approve:", allowance);

        vm.stopPrank();

        console.log("\n--- Step 4: Build MintRequest ---");

        // Build the picks array
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](2);
        picks[0] = IV2Types.Pick({
            conditionResolver: RESOLVER,
            conditionId: abi.encode(
                bytes32(
                    0xa8cf9bbc27d7def898d24e05d684f2bc95aa563ebf497998cfd5edb5f995a228
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.YES
        });
        picks[1] = IV2Types.Pick({
            conditionResolver: RESOLVER,
            conditionId: abi.encode(
                bytes32(
                    0xaa29c399d3701dd41fd76dc0ed57be0e53cbfff0632420974cebee5a58b4f016
                )
            ),
            predictedOutcome: IV2Types.OutcomeSide.NO
        });

        // Values from the UserOp
        IV2Types.MintRequest memory request = IV2Types.MintRequest({
            picks: picks,
            predictorCollateral: predictorCollateral,
            counterpartyCollateral: counterpartyCollateral,
            predictor: PREDICTOR,
            counterparty: COUNTERPARTY,
            predictorNonce: 0,
            counterpartyNonce: 5,
            predictorDeadline: 1_770_245_065,
            counterpartyDeadline: 1_770_244_820,
            // Signatures from the UserOp (these are the actual signed values)
            predictorSignature: hex"2ac66c1c21c162205492d1301ff7fa9f2a12f4c0ba6180ec348b23fce1260d0611f75f17db745f26c83c043145ea5f5e69535f766f6af9805f1d0a752ccc71121b",
            counterpartySignature: hex"fd5a39994413e7b4e51537f5dc783f636f3f7da9d2d2db1a51c8268d60d5d0f825fd4a6f5b4c2863d831aa7589b302b61c5c771a85a314dd0b3137a0b9c88e701b",
            refCode: bytes32(0),
            // Session key data for predictor
            predictorSessionKeyData: hex"00000000000000000000000083236e9d2170ffe24fb620c81aacef049116da54000000000000000000000000efa0e8aa84a713f6a6d4de8cc761fe86c5957d7200000000000000000000000000000000000000000000000000000000698d04c8d9762d852ca8dc23710c3bf3bca341b66f778a0c94cc060f0463687e9c260e9c0000000000000000000000000000000000000000000000000000000000cc12fa00000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000041e716031e242e506e7faa4eb96f1909e7dd0696ac3be5cc73fbfdd4c89bce525a74c92b749ee63f11732d3da4777d50ddb910b7d66e8c446ce0ee3cc55e3d685d1b00000000000000000000000000000000000000000000000000000000000000",
            counterpartySessionKeyData: hex"",
            predictorSponsor: address(0),
            predictorSponsorData: hex""
        });

        console.log("MintRequest built with:");
        console.log("  predictorCollateral:", request.predictorCollateral);
        console.log("  counterpartyCollateral:", request.counterpartyCollateral);
        console.log("  predictor:", request.predictor);
        console.log("  counterparty:", request.counterparty);
        console.log("  predictorNonce:", request.predictorNonce);
        console.log("  counterpartyNonce:", request.counterpartyNonce);
        console.log("  predictorDeadline:", request.predictorDeadline);
        console.log("  counterpartyDeadline:", request.counterpartyDeadline);

        console.log("\n--- Step 5: Call mint() ---");

        // Call mint as the SmartAccount
        vm.prank(PREDICTOR);
        try IPredictionMarketEscrow(ESCROW).mint(request) {
            console.log("MINT SUCCEEDED!");
        } catch Error(string memory reason) {
            console.log("MINT FAILED with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("MINT FAILED with low-level error");
            console.log("Error data length:", lowLevelData.length);
            if (lowLevelData.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(lowLevelData, 32))
                }
                console.log("Error selector:");
                console.logBytes4(selector);
            }
            if (lowLevelData.length > 0) {
                console.log("Full error data:");
                console.logBytes(lowLevelData);
            }
        }
    }
}
