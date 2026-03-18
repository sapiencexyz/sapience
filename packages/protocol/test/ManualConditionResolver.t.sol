// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";

contract ManualConditionResolverTest is Test {
    ManualConditionResolver public resolver;

    address public owner;
    address public settler1;
    address public settler2;
    address public unauthorizedUser;

    bytes32 public constant RAW_CONDITION_ID_1 = keccak256("condition-1");
    bytes32 public constant RAW_CONDITION_ID_2 = keccak256("condition-2");
    bytes32 public constant RAW_CONDITION_ID_3 = keccak256("condition-3");

    // bytes-encoded versions for IConditionResolver interface
    bytes public CONDITION_ID_1;
    bytes public CONDITION_ID_2;
    bytes public CONDITION_ID_3;

    event SettlerApproved(address indexed settler);
    event SettlerRevoked(address indexed settler);
    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        uint256 yesWeight,
        uint256 noWeight,
        address indexed settler
    );

    event ConditionResolved(
        bytes conditionId, bool isIndecisive, bool resolvedToYes
    );

    function setUp() public {
        owner = vm.addr(1);
        settler1 = vm.addr(2);
        settler2 = vm.addr(3);
        unauthorizedUser = vm.addr(4);

        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);

        CONDITION_ID_1 = abi.encode(RAW_CONDITION_ID_1);
        CONDITION_ID_2 = abi.encode(RAW_CONDITION_ID_2);
        CONDITION_ID_3 = abi.encode(RAW_CONDITION_ID_3);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(resolver.owner(), owner);
    }

    // ============ Settler Management Tests ============

    function test_approveSettler_success() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit SettlerApproved(settler1);
        resolver.approveSettler(settler1);

        assertTrue(resolver.approvedSettlers(settler1));
    }

    function test_approveSettler_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        resolver.approveSettler(settler1);
    }

    function test_revokeSettler_success() public {
        vm.startPrank(owner);
        resolver.approveSettler(settler1);

        vm.expectEmit(true, false, false, false);
        emit SettlerRevoked(settler1);
        resolver.revokeSettler(settler1);
        vm.stopPrank();

        assertFalse(resolver.approvedSettlers(settler1));
    }

    function test_revokeSettler_revertIfNotOwner() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        resolver.revokeSettler(settler1);
    }

    function test_approveSettlers_batch() public {
        address[] memory settlers = new address[](2);
        settlers[0] = settler1;
        settlers[1] = settler2;

        vm.prank(owner);
        resolver.approveSettlers(settlers);

        assertTrue(resolver.approvedSettlers(settler1));
        assertTrue(resolver.approvedSettlers(settler2));
    }

    // ============ Settle Condition Tests ============

    function test_settleCondition_yesWins() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 0);

        vm.prank(settler1);
        vm.expectEmit(true, false, false, true);
        emit ConditionResolutionDetail(RAW_CONDITION_ID_1, 1, 0, settler1);
        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(RAW_CONDITION_ID_1), false, true);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);

        assertTrue(resolver.isSettled(RAW_CONDITION_ID_1));

        (bool isResolved, IV2Types.OutcomeVector memory result) =
            resolver.getResolution(CONDITION_ID_1);
        assertTrue(isResolved);
        assertEq(result.yesWeight, 1);
        assertEq(result.noWeight, 0);
    }

    function test_settleCondition_noWins() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(0, 1);

        vm.prank(settler1);
        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(RAW_CONDITION_ID_1), false, false);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);

        (bool isResolved, IV2Types.OutcomeVector memory result) =
            resolver.getResolution(CONDITION_ID_1);
        assertTrue(isResolved);
        assertEq(result.yesWeight, 0);
        assertEq(result.noWeight, 1);
    }

    function test_settleCondition_tie() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 1);

        vm.prank(settler1);
        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(RAW_CONDITION_ID_1), true, false);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);

        (bool isResolved, IV2Types.OutcomeVector memory result) =
            resolver.getResolution(CONDITION_ID_1);
        assertTrue(isResolved);
        assertEq(result.yesWeight, 1);
        assertEq(result.noWeight, 1);
    }

    function test_settleCondition_revertIfNotApproved() public {
        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 0);

        vm.prank(unauthorizedUser);
        vm.expectRevert(ManualConditionResolver.NotApprovedSettler.selector);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);
    }

    function test_settleCondition_revertIfAlreadySettled() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(1, 0);

        vm.prank(settler1);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);

        vm.prank(settler1);
        vm.expectRevert(
            ManualConditionResolver.ConditionAlreadySettled.selector
        );
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);
    }

    function test_settleCondition_revertIfInvalidOutcome() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        IV2Types.OutcomeVector memory outcome = IV2Types.OutcomeVector(0, 0);

        vm.prank(settler1);
        vm.expectRevert(ManualConditionResolver.InvalidOutcome.selector);
        resolver.settleCondition(RAW_CONDITION_ID_1, outcome);
    }

    // ============ Batch Settle Tests ============

    function test_settleConditions_batch() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        bytes32[] memory conditionIds = new bytes32[](3);
        conditionIds[0] = RAW_CONDITION_ID_1;
        conditionIds[1] = RAW_CONDITION_ID_2;
        conditionIds[2] = RAW_CONDITION_ID_3;

        IV2Types.OutcomeVector[] memory outcomes =
            new IV2Types.OutcomeVector[](3);
        outcomes[0] = IV2Types.OutcomeVector(1, 0); // YES
        outcomes[1] = IV2Types.OutcomeVector(0, 1); // NO
        outcomes[2] = IV2Types.OutcomeVector(1, 1); // TIE

        vm.prank(settler1);
        resolver.settleConditions(conditionIds, outcomes);

        assertTrue(resolver.isSettled(RAW_CONDITION_ID_1));
        assertTrue(resolver.isSettled(RAW_CONDITION_ID_2));
        assertTrue(resolver.isSettled(RAW_CONDITION_ID_3));
    }

    // ============ IConditionResolver Interface Tests ============

    function test_isValidCondition_nonZero() public view {
        assertTrue(resolver.isValidCondition(CONDITION_ID_1));
    }

    function test_isValidCondition_zero() public view {
        assertFalse(resolver.isValidCondition(abi.encode(bytes32(0))));
    }

    function test_getResolution_notSettled() public view {
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(CONDITION_ID_1);

        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }

    function test_getResolutions_batch() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        // Settle first condition
        vm.prank(settler1);
        resolver.settleCondition(
            RAW_CONDITION_ID_1, IV2Types.OutcomeVector(1, 0)
        );

        // Query batch (one settled, one not)
        bytes[] memory conditionIds = new bytes[](2);
        conditionIds[0] = CONDITION_ID_1;
        conditionIds[1] = CONDITION_ID_2;

        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            resolver.getResolutions(conditionIds);

        assertTrue(resolved[0]);
        assertFalse(resolved[1]);
        assertEq(outcomes[0].yesWeight, 1);
        assertEq(outcomes[1].yesWeight, 0);
    }

    function test_isFinalized_settled() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        vm.prank(settler1);
        resolver.settleCondition(
            RAW_CONDITION_ID_1, IV2Types.OutcomeVector(1, 0)
        );

        assertTrue(resolver.isFinalized(CONDITION_ID_1));
    }

    function test_isFinalized_notSettled() public view {
        assertFalse(resolver.isFinalized(CONDITION_ID_1));
    }

    // ============ View Functions Tests ============

    function test_getOutcome() public {
        vm.prank(owner);
        resolver.approveSettler(settler1);

        vm.prank(settler1);
        resolver.settleCondition(
            RAW_CONDITION_ID_1, IV2Types.OutcomeVector(5, 3)
        );

        IV2Types.OutcomeVector memory outcome =
            resolver.getOutcome(RAW_CONDITION_ID_1);
        assertEq(outcome.yesWeight, 5);
        assertEq(outcome.noWeight, 3);
    }
}
