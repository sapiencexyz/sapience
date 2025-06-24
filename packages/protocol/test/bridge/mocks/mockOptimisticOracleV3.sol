// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IUMALayerZeroBridge} from "../../../src/bridge/interfaces/ILayerZeroBridge.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console2} from "forge-std/console2.sol";

/**
 * @title MockOptimisticOracleV3
 * @notice Mock contract that implements the OptimisticOracleV3 interface functions
 * for testing purposes. This simulates a OptimisticOracleV3 that can submit settlements
 * and receive callbacks from UMA.
 */
contract MockOptimisticOracleV3 {
  struct AssertionData {
    bytes claim;
    address asserter;
    address sender;
    address receiver;
    uint256 liveness;
    IERC20 bondToken;
    uint256 bondAmount;
  }

  bytes32 public lastAssertionId;
  mapping(bytes32 => AssertionData) public assertionData;


    IUMALayerZeroBridge public bridge;

    constructor(address _bridge) {
        bridge = IUMALayerZeroBridge(_bridge);
    }

  function resolveAssertion(bytes32 assertionId, bool assertedTruthfully) external {
    bridge.assertionResolvedCallback(assertionId, assertedTruthfully);
  }

  function disputeAssertion(bytes32 assertionId) external {
    bridge.assertionDisputedCallback(assertionId);
  }

  function assertTruth(
    bytes memory claim,
    address asserter,
    address sender,
    address receiver,
    uint256 liveness,
    IERC20 bondToken,
    uint256 bondAmount
  ) external returns (bytes32 assertionId) {  
    console2.log("assertTruth");
    assertionId = keccak256(abi.encodePacked(claim, asserter, sender, receiver, liveness, address(bondToken), bondAmount));
    console2.log("assertTruth 2");
    assertionData[assertionId] = AssertionData({
      claim: claim,
      asserter: asserter,
      sender: sender,
      receiver: receiver,
      liveness: liveness,
      bondToken: bondToken,
      bondAmount: bondAmount
    });
    console2.log("assertTruth 3");
    lastAssertionId = assertionId;
    console2.log("assertTruth 4");
    return assertionId;
  }
}
