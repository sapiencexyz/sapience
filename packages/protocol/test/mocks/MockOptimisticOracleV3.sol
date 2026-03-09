// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    LZConditionResolverUmaSide
} from "../../src/resolvers/lz-uma/LZConditionResolverUmaSide.sol";

/// @title MockOptimisticOracleV3
/// @notice Mock OptimisticOracleV3 for v2 LZ resolver testing
contract MockOptimisticOracleV3 {
    address payable private _resolver;

    struct AssertionData {
        bytes claim;
        address asserter;
        address callbackRecipient;
        uint64 liveness;
        address bondToken;
        uint256 bondAmount;
    }

    bytes32 public lastAssertionId;
    mapping(bytes32 => AssertionData) public assertions;

    function setResolver(address resolver_) external {
        _resolver = payable(resolver_);
    }

    function getLastAssertionId() external view returns (bytes32) {
        return lastAssertionId;
    }

    function getAssertionData(bytes32 assertionId)
        external
        view
        returns (AssertionData memory)
    {
        return assertions[assertionId];
    }

    /// @notice Simulate resolving an assertion
    function resolveAssertion(bytes32 assertionId, bool assertedTruthfully)
        external
    {
        if (_resolver != address(0)) {
            LZConditionResolverUmaSide(_resolver)
                .assertionResolvedCallback(assertionId, assertedTruthfully);
        }
    }

    /// @notice Simulate disputing an assertion
    function disputeAssertion(bytes32 assertionId) external {
        if (_resolver != address(0)) {
            LZConditionResolverUmaSide(_resolver)
                .assertionDisputedCallback(assertionId);
        }
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address, /* escalationManager */
        uint64 liveness,
        address currency,
        uint256 bond,
        bytes32, /* identifier */
        bytes32 /* domainId */
    ) public returns (bytes32 assertionId) {
        assertionId = keccak256(
            abi.encodePacked(
                claim,
                asserter,
                callbackRecipient,
                liveness,
                currency,
                bond,
                block.timestamp
            )
        );

        assertions[assertionId] = AssertionData({
            claim: claim,
            asserter: asserter,
            callbackRecipient: callbackRecipient,
            liveness: liveness,
            bondToken: currency,
            bondAmount: bond
        });

        lastAssertionId = assertionId;
        return assertionId;
    }

    function getMinimumBond(address) external pure returns (uint256) {
        return 0.1 ether;
    }
}
