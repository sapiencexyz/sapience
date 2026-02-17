// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {PredictionMarketLZResolverUmaSide} from "../../../src/predictionMarket/resolvers/PredictionMarketLZResolverUmaSide.sol";

/**
 * @title MockOptimisticOracleV3ForPMResolver
 * @notice Mock OptimisticOracleV3 for PredictionMarket resolver testing
 */
contract MockOptimisticOracleV3ForPMResolver {
    address payable private resolver;

    struct AssertionData {
        bytes claim;
        address asserter;
        address sender;
        address receiver;
        uint256 liveness;
        address bondToken;
        uint256 bondAmount;
    }

    bytes32 public lastAssertionId;
    mapping(bytes32 => AssertionData) public assertionData;

    function setResolver(address _resolver) external {
        resolver = payable(_resolver);
    }

    function getLastAssertionId() external view returns (bytes32) {
        return lastAssertionId;
    }

    function getAssertionData(bytes32 assertionId) external view returns (AssertionData memory) {
        return assertionData[assertionId];
    }

    function resolveAssertion(bytes32 assertionId, bool assertedTruthfully) external {
        if (resolver != address(0)) {
            PredictionMarketLZResolverUmaSide(resolver).assertionResolvedCallback(assertionId, assertedTruthfully);
        }
    }

    function disputeAssertion(bytes32 assertionId) external {
        if (resolver != address(0)) {
            PredictionMarketLZResolverUmaSide(resolver).assertionDisputedCallback(assertionId);
        }
    }

    function defaultIdentifier() public pure returns (bytes32) {
        return bytes32(0x1337000000000000000000000000000000000000000000000000000000000000);
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address /* escalationManager */,
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 /* domainId */
    ) public returns (bytes32 assertionId) {
        assertionId = keccak256(
            abi.encodePacked(
                claim, asserter, callbackRecipient, liveness, currency, bond, block.timestamp
            )
        );

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

    function getAssertion(bytes32 /* assertionId */ ) external pure returns (bytes memory) {
        return "";
    }

    function syncUmaParams(bytes32 /* identifier */, address /* currency */ ) external {
        // Mock implementation
    }

    function getMinimumBond(address) external pure returns (uint256) {
        return 0.1 ether; // Mock minimum bond
    }
}

