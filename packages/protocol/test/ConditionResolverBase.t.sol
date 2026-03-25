// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/resolvers/ConditionResolverBase.sol";
import "../src/interfaces/IV2Types.sol";

/// @notice Minimal concrete contract exposing _emitResolved for testing
contract TestableConditionResolver is ConditionResolverBase {
    function emitResolved(
        bytes memory conditionId,
        IV2Types.OutcomeVector memory outcome
    ) external {
        _emitResolved(conditionId, outcome);
    }

    // Stub IConditionResolver functions
    function isValidCondition(bytes calldata) external pure returns (bool) {
        return true;
    }

    function getResolution(bytes calldata)
        external
        pure
        returns (bool, IV2Types.OutcomeVector memory)
    {
        return (false, IV2Types.OutcomeVector(0, 0));
    }

    function getResolutions(bytes[] calldata)
        external
        pure
        returns (bool[] memory, IV2Types.OutcomeVector[] memory)
    {
        bool[] memory r = new bool[](0);
        IV2Types.OutcomeVector[] memory o = new IV2Types.OutcomeVector[](0);
        return (r, o);
    }

    function isFinalized(bytes calldata) external pure returns (bool) {
        return false;
    }
}

contract ConditionResolverBaseTest is Test {
    TestableConditionResolver public resolver;

    event ConditionResolved(
        bytes conditionId, bool isIndecisive, bool resolvedToYes
    );

    function setUp() public {
        resolver = new TestableConditionResolver();
    }

    function test_emitResolved_yesOutcome() public {
        bytes memory conditionId = abi.encode(keccak256("yes-condition"));
        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 0);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(conditionId, false, true);

        resolver.emitResolved(conditionId, outcome);
    }

    function test_emitResolved_noOutcome() public {
        bytes memory conditionId = abi.encode(keccak256("no-condition"));
        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(0, 1);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(conditionId, false, false);

        resolver.emitResolved(conditionId, outcome);
    }

    function test_emitResolved_tieOutcome() public {
        bytes memory conditionId = abi.encode(keccak256("tie-condition"));
        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 1);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(conditionId, true, false);

        resolver.emitResolved(conditionId, outcome);
    }
}
