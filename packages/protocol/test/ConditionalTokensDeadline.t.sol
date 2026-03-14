// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    TestHelperOz5
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {
    ConditionalTokensConditionResolver
} from "../src/resolvers/conditionalTokens/ConditionalTokensConditionResolver.sol";
import {
    IConditionalTokensConditionResolver
} from "../src/resolvers/conditionalTokens/interfaces/IConditionalTokensConditionResolver.sol";
import { IConditionResolver } from "../src/interfaces/IConditionResolver.sol";
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import { LZTypes } from "../src/resolvers/shared/LZTypes.sol";
import "forge-std/Test.sol";

/// @title ConditionalTokensDeadlineTest
/// @notice Tests for deadline-aware conditionId resolution and strict length validation
contract ConditionalTokensDeadlineTest is TestHelperOz5 {
    ConditionalTokensConditionResolver private resolver;

    address private owner;
    uint32 private pmEid = 1;
    uint32 private remoteEid = 2;
    address private remoteBridge;

    bytes32 public constant RAW_CONDITION_ID =
        keccak256("deadline-test-condition");

    function setUp() public override {
        owner = address(this);
        vm.deal(owner, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        resolver = ConditionalTokensConditionResolver(
            payable(_deployOApp(
                    type(ConditionalTokensConditionResolver).creationCode,
                    abi.encode(address(endpoints[pmEid]), owner)
                ))
        );

        // Deploy a second OApp as mock remote
        ConditionalTokensConditionResolver mockRemote =
            ConditionalTokensConditionResolver(
                payable(_deployOApp(
                        type(ConditionalTokensConditionResolver).creationCode,
                        abi.encode(address(endpoints[remoteEid]), owner)
                    ))
            );
        remoteBridge = address(mockRemote);

        address[] memory oapps = new address[](2);
        oapps[0] = address(resolver);
        oapps[1] = remoteBridge;
        this.wireOApps(oapps);

        resolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: remoteEid, remoteBridge: remoteBridge
            })
        );
    }

    // ============ conditionId Length Validation ============

    function test_isValidCondition_32bytes_valid() public view {
        bytes memory cid = abi.encode(RAW_CONDITION_ID);
        assertTrue(resolver.isValidCondition(cid));
    }

    function test_isValidCondition_64bytes_valid() public view {
        bytes memory cid = abi.encode(RAW_CONDITION_ID, uint256(1000));
        assertTrue(resolver.isValidCondition(cid));
    }

    function test_isValidCondition_lessThan32bytes_invalid() public view {
        bytes memory cid = abi.encode(uint128(1)); // 16 bytes when tight-packed, but abi.encode pads to 32
        // Use raw bytes shorter than 32
        bytes memory shortCid = new bytes(16);
        assertFalse(resolver.isValidCondition(shortCid));
    }

    function test_isValidCondition_33bytes_invalid() public view {
        bytes memory cid = new bytes(33);
        cid[0] = 0x01;
        assertFalse(resolver.isValidCondition(cid));
    }

    function test_isValidCondition_96bytes_invalid() public view {
        bytes memory cid = new bytes(96);
        cid[0] = 0x01;
        assertFalse(resolver.isValidCondition(cid));
    }

    function test_isValidCondition_32bytes_zeroId_invalid() public view {
        bytes memory cid = abi.encode(bytes32(0));
        assertFalse(resolver.isValidCondition(cid));
    }

    // ============ Deadline-Aware Resolution ============

    function test_getResolution_noDeadline_unresolved() public view {
        bytes memory cid = abi.encode(RAW_CONDITION_ID);
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }

    function test_getResolution_withDeadline_beforeDeadline_unresolved()
        public
        view
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }

    function test_getResolution_withDeadline_afterDeadline_indecisive() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);

        // Warp past deadline
        vm.warp(deadline + 1);

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertTrue(isResolved);
        // Indecisive = tie [1,1]
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 1);
    }

    function test_getResolution_withDeadline_settledBeforeDeadline_normalResolution()
        public
    {
        uint256 deadline = block.timestamp + 1 hours;

        // Settle the condition via LZ message (YES wins)
        _settleCondition(RAW_CONDITION_ID, 1, 0, 1);

        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_getResolution_withDeadline_settledAfterDeadline_normalResolution()
        public
    {
        uint256 deadline = block.timestamp + 1 hours;

        // Settle the condition (YES wins)
        _settleCondition(RAW_CONDITION_ID, 1, 0, 1);

        // Warp past deadline — should still return settled result, not indecisive
        vm.warp(deadline + 1);

        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_getResolution_noDeadline_neverBecomesIndecisive() public {
        bytes memory cid = abi.encode(RAW_CONDITION_ID);

        // Warp far into the future — without deadline, should stay unresolved
        vm.warp(block.timestamp + 365 days);

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            resolver.getResolution(cid);
        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }

    // ============ Batch Resolution with Deadlines ============

    function test_getResolutions_mixedDeadlines() public {
        vm.warp(1000); // Ensure block.timestamp > 1 for past deadline
        bytes32 cond1 = keccak256("batch-deadline-1");
        bytes32 cond2 = keccak256("batch-deadline-2");
        bytes32 cond3 = keccak256("batch-deadline-3");

        uint256 pastDeadline = block.timestamp - 1;
        uint256 futureDeadline = block.timestamp + 1 hours;

        // Settle cond1 as YES
        _settleCondition(cond1, 1, 0, 1);

        bytes[] memory cids = new bytes[](3);
        cids[0] = abi.encode(cond1); // Settled, no deadline
        cids[1] = abi.encode(cond2, pastDeadline); // Unresolved, past deadline → indecisive
        cids[2] = abi.encode(cond3, futureDeadline); // Unresolved, future deadline → unresolved

        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            resolver.getResolutions(cids);

        // cond1: settled YES
        assertTrue(resolved[0]);
        assertEq(outcomes[0].yesWeight, 1);
        assertEq(outcomes[0].noWeight, 0);

        // cond2: past deadline, unresolved → indecisive
        assertTrue(resolved[1]);
        assertEq(outcomes[1].yesWeight, 1);
        assertEq(outcomes[1].noWeight, 1);

        // cond3: future deadline, unresolved → still unresolved
        assertFalse(resolved[2]);
        assertEq(outcomes[2].yesWeight, 0);
        assertEq(outcomes[2].noWeight, 0);
    }

    // ============ Same conditionId, different deadlines ============

    function test_sameConditionId_differentDeadlines_differentResults() public {
        vm.warp(1000); // Ensure block.timestamp > 1 for past deadline
        uint256 pastDeadline = block.timestamp - 1;
        uint256 futureDeadline = block.timestamp + 1 hours;

        bytes memory cidPastDeadline =
            abi.encode(RAW_CONDITION_ID, pastDeadline);
        bytes memory cidFutureDeadline =
            abi.encode(RAW_CONDITION_ID, futureDeadline);
        bytes memory cidNoDeadline = abi.encode(RAW_CONDITION_ID);

        // Past deadline → indecisive
        (bool r1, IV2Types.OutcomeVector memory o1) =
            resolver.getResolution(cidPastDeadline);
        assertTrue(r1);
        assertEq(o1.yesWeight, 1);
        assertEq(o1.noWeight, 1);

        // Future deadline → unresolved
        (bool r2, IV2Types.OutcomeVector memory o2) =
            resolver.getResolution(cidFutureDeadline);
        assertFalse(r2);
        assertEq(o2.yesWeight, 0);
        assertEq(o2.noWeight, 0);

        // No deadline → unresolved
        (bool r3, IV2Types.OutcomeVector memory o3) =
            resolver.getResolution(cidNoDeadline);
        assertFalse(r3);
        assertEq(o3.yesWeight, 0);
        assertEq(o3.noWeight, 0);
    }

    // ============ isFinalized + Deadline ============

    function test_isFinalized_noDeadline_unresolved_false() public view {
        bytes memory cid = abi.encode(RAW_CONDITION_ID);
        assertFalse(resolver.isFinalized(cid));
    }

    function test_isFinalized_noDeadline_settled_true() public {
        _settleCondition(RAW_CONDITION_ID, 1, 0, 1);
        bytes memory cid = abi.encode(RAW_CONDITION_ID);
        assertTrue(resolver.isFinalized(cid));
    }

    function test_isFinalized_withDeadline_beforeDeadline_unresolved_false()
        public
        view
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);
        assertFalse(resolver.isFinalized(cid));
    }

    function test_isFinalized_withDeadline_pastDeadline_unresolved_true()
        public
    {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);

        vm.warp(deadline + 1);

        // Past deadline + unresolved → finalized as indecisive
        assertTrue(resolver.isFinalized(cid));
    }

    function test_isFinalized_withDeadline_settled_true() public {
        _settleCondition(RAW_CONDITION_ID, 1, 0, 1);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory cid = abi.encode(RAW_CONDITION_ID, deadline);
        assertTrue(resolver.isFinalized(cid));
    }

    // ============ Helper ============

    function _settleCondition(
        bytes32 conditionId,
        uint256 denom,
        uint256 noPayout,
        uint256 yesPayout
    ) internal {
        bytes memory payload =
            abi.encode(conditionId, denom, noPayout, yesPayout);
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        resolver.lzReceive(
            Origin({
                srcEid: remoteEid,
                sender: bytes32(uint256(uint160(remoteBridge))),
                nonce: 0
            }),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function _createOrigin(uint32 srcEid, address sender)
        internal
        pure
        returns (Origin memory)
    {
        return Origin({
            srcEid: srcEid, sender: bytes32(uint256(uint160(sender))), nonce: 0
        });
    }
}
