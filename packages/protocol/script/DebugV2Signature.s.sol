// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/v2/interfaces/IV2Types.sol";

interface IEscrowDebug {
    function getNonce(address account) external view returns (uint256);
    function accountFactory() external view returns (address);
    function getMintApprovalHash(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32);
    function getSessionKeyApprovalHash(
        address sessionKey,
        address smartAccount,
        uint256 validUntil,
        bytes32 permissionsHash,
        uint256 chainId
    ) external view returns (bytes32);
}

interface IAccountFactory {
    function getAccountAddress(address owner, uint256 index) external view returns (address);
}

contract DebugV2Signature is Script {
    function run() external view {
        IEscrowDebug escrow = IEscrowDebug(0x8730eE1194Cd03A14deA9975e2bafD4C8b6019F1);

        address predictor = 0x5aab6F438Af9289798eEcBf83C06f62abdb529B9;
        address counterparty = 0xd8e6Af4901719176F0e2c89dEfAc30C12Ea6aB4B;
        address sessionKey = 0xBbB00443e1bB97c8f89e5343E78645dF439c971a;
        address owner = 0xefA0E8Aa84A713f6A6d4De8cC761Fe86c5957d72;

        console.log("=== Nonces ===");
        console.log("Predictor on-chain:", escrow.getNonce(predictor));
        console.log("Counterparty on-chain:", escrow.getNonce(counterparty));

        console.log("\n=== Timestamps ===");
        console.log("Block timestamp:", block.timestamp);
        console.log("Block chainId:", block.chainid);

        address factory = escrow.accountFactory();
        console.log("\n=== Account Factory ===");
        console.log("Factory:", factory);

        if (factory != address(0)) {
            address derived0 = IAccountFactory(factory).getAccountAddress(owner, 0);
            address derived1 = IAccountFactory(factory).getAccountAddress(owner, 1);
            console.log("Derived (idx 0):", derived0);
            console.log("Derived (idx 1):", derived1);
            console.log("Predictor:", predictor);
            console.log("Match idx0:", derived0 == predictor);
        }
    }
}
