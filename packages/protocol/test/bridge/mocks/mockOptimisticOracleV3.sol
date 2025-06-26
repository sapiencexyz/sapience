// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IUMALayerZeroBridge} from "../../../src/bridge/interfaces/ILayerZeroBridge.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {console2} from "forge-std/console2.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OptimisticOracleV3Interface} from "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";

/**
 * @title MockOptimisticOracleV3
 * @notice Mock contract that implements the OptimisticOracleV3 interface functions
 * for testing purposes. This simulates a OptimisticOracleV3 that can submit settlements
 * and receive callbacks from UMA.
 */
contract MockOptimisticOracleV3 is OptimisticOracleV3Interface {
  using SafeERC20 for IERC20;

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
  mapping(bytes32 => Assertion) public assertions;

  IUMALayerZeroBridge public bridge;

  constructor(address _bridge) {
    bridge = IUMALayerZeroBridge(_bridge);
  }

  function getLastAssertionId() external view returns (bytes32) {
    return lastAssertionId;
  }

  function getAssertionData(bytes32 assertionId) external view returns (AssertionData memory) {
    return assertionData[assertionId];
  }

  function resolveAssertion(bytes32 assertionId, bool assertedTruthfully) external {
    IERC20 currency = assertionData[assertionId].bondToken;
    currency.safeTransfer(assertionData[assertionId].asserter, assertionData[assertionId].bondAmount);


    bridge.assertionResolvedCallback(assertionId, assertedTruthfully);
  }

  function disputeAssertion(bytes32 assertionId) external {
    IERC20 currency = assertionData[assertionId].bondToken;
    // burn the bond
    currency.safeTransfer(address(0x1337fEEfEEFeEfEEFeEfEEfeEFEeFeeFEEfeefEE), assertionData[assertionId].bondAmount);
    bridge.assertionDisputedCallback(assertionId);
  }

  function defaultIdentifier() public pure returns (bytes32) {
    return bytes32(0x1337000000000000000000000000000000000000000000000000000000000000);  
  } 

  function assertTruth(
    bytes memory claim,
    address asserter,
    address callbackRecipient,
    address escalationManager,
    uint64 liveness,
    IERC20 currency,
    uint256 bond,
    bytes32 identifier,
    bytes32 domainId
  ) public returns (bytes32 assertionId) {  
    currency.safeTransferFrom(msg.sender, address(this), bond);
    assertionId = keccak256(abi.encodePacked(claim, asserter, callbackRecipient, escalationManager, liveness, address(currency), bond));
    
    // Create the assertion struct
    EscalationManagerSettings memory emSettings = EscalationManagerSettings({
      arbitrateViaEscalationManager: false,
      discardOracle: false,
      validateDisputers: false,
      assertingCaller: msg.sender,
      escalationManager: escalationManager
    });

    assertions[assertionId] = Assertion({
      escalationManagerSettings: emSettings,
      asserter: asserter,
      assertionTime: uint64(block.timestamp),
      settled: false,
      currency: currency,
      expirationTime: uint64(block.timestamp + liveness),
      settlementResolution: false,
      domainId: domainId,
      identifier: identifier,
      bond: bond,
      callbackRecipient: callbackRecipient,
      disputer: address(0)
    });

    assertionData[assertionId] = AssertionData({
      claim: claim,
      asserter: asserter,
      sender: msg.sender,
      receiver: callbackRecipient,
      liveness: liveness,
      bondToken: currency,
      bondAmount: bond
    });
    lastAssertionId = assertionId;

    return assertionId;
  }

  function assertTruthWithDefaults(
    bytes memory claim,
    address asserter
  ) external returns (bytes32) {
    return assertTruth(
      claim,
      asserter,
      address(0),
      address(0),
      3600, // default liveness
      IERC20(address(0)), // default currency
      1 ether, // default bond
      defaultIdentifier(),
      bytes32(0)
    );
  }

  function getAssertion(
    bytes32 assertionId
  ) external view returns (Assertion memory) {
    return assertions[assertionId];
  }

  function syncUmaParams(bytes32 identifier, address currency) external {
    // Mock implementation - no action needed
  }

  function settleAssertion(bytes32 assertionId) public {
    Assertion storage assertion = assertions[assertionId];
    require(!assertion.settled, "Assertion already settled");
    
    assertion.settled = true;
    assertion.settlementResolution = true; // Mock: always resolve as true
    
    // Transfer bond back to asserter
    assertion.currency.safeTransfer(assertion.asserter, assertion.bond);
  }

  function settleAndGetAssertionResult(
    bytes32 assertionId
  ) external returns (bool) {
    settleAssertion(assertionId);
    return true; // Mock: always return true
  }

  function getAssertionResult(
    bytes32 assertionId
  ) external view returns (bool) {
    Assertion storage assertion = assertions[assertionId];
    return assertion.settlementResolution;
  }

  function getMinimumBond(address currency) external view returns (uint256) {
    return 0.1 ether; // Mock minimum bond
  }

  function disputeAssertion(bytes32 assertionId, address disputer) external {
    Assertion storage assertion = assertions[assertionId];
    assertion.disputer = disputer;
  }
}
