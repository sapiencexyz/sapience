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
    ConditionalTokensReader
} from "../src/resolvers/conditionalTokens/ConditionalTokensReader.sol";
import {
    IConditionalTokensConditionResolver
} from "../src/resolvers/conditionalTokens/interfaces/IConditionalTokensConditionResolver.sol";
import {
    IConditionalTokensReader
} from "../src/resolvers/conditionalTokens/interfaces/IConditionalTokensReader.sol";
import { IConditionResolver } from "../src/interfaces/IConditionResolver.sol";
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import { LZTypes } from "../src/resolvers/shared/LZTypes.sol";
import { MockConditionalTokens } from "./mocks/MockConditionalTokens.sol";
import "forge-std/Test.sol";

/// @title ConditionalTokensConditionResolverTest
/// @notice Test suite for ConditionalTokensConditionResolver
contract ConditionalTokensConditionResolverTest is TestHelperOz5 {
    // Users
    address private owner;
    address private unauthorizedUser;

    // Contracts
    ConditionalTokensConditionResolver private pmResolver;
    ConditionalTokensReader private polygonReader;
    MockConditionalTokens private mockCT;

    // LZ data
    uint32 private pmEid = 1;
    uint32 private polygonEid = 2;

    // Test data
    bytes32 public constant CONDITION_ID_1 = keccak256("condition-1");
    bytes32 public constant CONDITION_ID_2 = keccak256("condition-2");
    bytes32 public constant CONDITION_ID_3 = keccak256("condition-3");

    // Events
    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        bool invalid,
        bool nonDecisive,
        bool resolvedToYes,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        uint256 timestamp
    );

    // Unified event from IConditionResolver
    event ConditionResolved(
        bytes conditionId, bool isIndecisive, bool resolvedToYes
    );

    event BridgeConfigUpdated(LZTypes.BridgeConfig config);

    function setUp() public override {
        owner = address(this);
        unauthorizedUser = vm.addr(999);

        vm.deal(owner, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy mock ConditionalTokens
        mockCT = new MockConditionalTokens();

        // Deploy PM-side resolver
        pmResolver = ConditionalTokensConditionResolver(
            payable(_deployOApp(
                    type(ConditionalTokensConditionResolver).creationCode,
                    abi.encode(address(endpoints[pmEid]), owner)
                ))
        );

        // Deploy Polygon-side reader
        polygonReader = ConditionalTokensReader(
            payable(_deployOApp(
                    type(ConditionalTokensReader).creationCode,
                    abi.encode(
                        address(endpoints[polygonEid]),
                        owner,
                        IConditionalTokensReader.Settings({
                            conditionalTokens: address(mockCT)
                        })
                    )
                ))
        );

        // Wire OApps
        address[] memory oapps = new address[](2);
        oapps[0] = address(pmResolver);
        oapps[1] = address(polygonReader);
        this.wireOApps(oapps);

        // Configure bridge
        pmResolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: polygonEid, remoteBridge: address(polygonReader)
            })
        );
        polygonReader.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: pmEid, remoteBridge: address(pmResolver)
            })
        );
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(pmResolver.owner(), owner);
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig_success() public {
        LZTypes.BridgeConfig memory newConfig = LZTypes.BridgeConfig({
            remoteEid: 999, remoteBridge: address(0x1234)
        });

        vm.expectEmit(false, false, false, true);
        emit BridgeConfigUpdated(newConfig);
        pmResolver.setBridgeConfig(newConfig);

        LZTypes.BridgeConfig memory retrieved = pmResolver.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999);
        assertEq(retrieved.remoteBridge, address(0x1234));
    }

    function test_setBridgeConfig_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        pmResolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: 999, remoteBridge: address(0x1234)
            })
        );
    }

    // ============ IConditionResolver Tests ============

    function test_isValidCondition_valid() public view {
        assertTrue(pmResolver.isValidCondition(abi.encode(CONDITION_ID_1)));
    }

    function test_isValidCondition_invalid() public view {
        assertFalse(pmResolver.isValidCondition(abi.encode(bytes32(0))));
    }

    function test_getResolution_notSettled() public view {
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertFalse(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 0);
    }

    function test_isFinalized_notSettled() public view {
        assertFalse(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));
    }

    // ============ LayerZero Message Tests ============

    function test_lzReceive_yesWins() public {
        // Simulate message from Polygon
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message = abi.encode(uint16(10), payload); // CMD_RESOLUTION_RESPONSE = 10

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(CONDITION_ID_1), false, true);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        assertTrue(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));
        assertTrue(pmResolver.isConditionSettled(CONDITION_ID_1));
        assertFalse(pmResolver.isConditionInvalid(CONDITION_ID_1));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_lzReceive_noWins() public {
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(1), uint256(0));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(CONDITION_ID_1), false, false);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 1);
    }

    function test_lzReceive_notResolvedYet() public {
        // payoutDenominator = 0 means not resolved
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(0), uint256(0), uint256(0));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        assertFalse(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));
        assertFalse(pmResolver.isConditionSettled(CONDITION_ID_1));
        assertFalse(pmResolver.isConditionInvalid(CONDITION_ID_1));
    }

    function test_lzReceive_tieMarkedAsNonDecisive() public {
        // Tie: noPayout == yesPayout
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(2), uint256(1), uint256(1));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(CONDITION_ID_1), true, false);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        // Tie is now valid and non-decisive
        assertTrue(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));
        assertTrue(pmResolver.isConditionSettled(CONDITION_ID_1));
        assertFalse(pmResolver.isConditionInvalid(CONDITION_ID_1));

        // getResolution should return [1,1] for non-decisive
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 1);

        // Verify condition state
        IConditionalTokensConditionResolver.ConditionState memory state =
            pmResolver.getCondition(CONDITION_ID_1);
        assertTrue(state.nonDecisive);
        assertFalse(state.resolvedToYes);
    }

    function test_lzReceive_invalidPayoutMarkedAsInvalid() public {
        // Invalid: noPayout + yesPayout != denom
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(10), uint256(3), uint256(5));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        assertTrue(pmResolver.isConditionInvalid(CONDITION_ID_1));
    }

    function test_lzReceive_cannotOverwriteSettled() public {
        // First settlement: YES wins
        bytes memory payload1 =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message1 = abi.encode(uint16(10), payload1);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message1,
            address(0),
            bytes("")
        );

        // Try to overwrite with NO wins - should be ignored
        bytes memory payload2 =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(1), uint256(0));
        bytes memory message2 = abi.encode(uint16(10), payload2);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message2,
            address(0),
            bytes("")
        );

        // Should still be YES
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_lzReceive_revertIfInvalidSourceChain() public {
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(999, address(polygonReader)), // Wrong EID
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function test_lzReceive_revertIfInvalidSender() public {
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(0xBAD)), // Wrong sender
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function test_lzReceive_revertIfInvalidCommandType() public {
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message = abi.encode(uint16(999), payload); // Wrong command

        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    // ============ Batch Resolution Tests ============

    function test_getResolutions_batch() public {
        // Settle first condition as YES
        bytes memory payload1 =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message1 = abi.encode(uint16(10), payload1);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message1,
            address(0),
            bytes("")
        );

        // Settle second condition as NO
        bytes memory payload2 =
            abi.encode(CONDITION_ID_2, uint256(1), uint256(1), uint256(0));
        bytes memory message2 = abi.encode(uint16(10), payload2);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message2,
            address(0),
            bytes("")
        );

        // Query batch
        bytes[] memory conditionIds = new bytes[](3);
        conditionIds[0] = abi.encode(CONDITION_ID_1);
        conditionIds[1] = abi.encode(CONDITION_ID_2);
        conditionIds[2] = abi.encode(CONDITION_ID_3); // Not settled

        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            pmResolver.getResolutions(conditionIds);

        assertTrue(resolved[0]);
        assertTrue(resolved[1]);
        assertFalse(resolved[2]);

        assertEq(outcomes[0].yesWeight, 1);
        assertEq(outcomes[0].noWeight, 0);
        assertEq(outcomes[1].yesWeight, 0);
        assertEq(outcomes[1].noWeight, 1);
        assertEq(outcomes[2].yesWeight, 0);
        assertEq(outcomes[2].noWeight, 0);
    }

    function test_getResolutions_batchWithNonDecisive() public {
        // Settle first condition as YES
        bytes memory payload1 =
            abi.encode(CONDITION_ID_1, uint256(1), uint256(0), uint256(1));
        bytes memory message1 = abi.encode(uint16(10), payload1);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message1,
            address(0),
            bytes("")
        );

        // Settle second condition as non-decisive (tie)
        bytes memory payload2 =
            abi.encode(CONDITION_ID_2, uint256(2), uint256(1), uint256(1));
        bytes memory message2 = abi.encode(uint16(10), payload2);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message2,
            address(0),
            bytes("")
        );

        // Settle third condition as NO
        bytes memory payload3 =
            abi.encode(CONDITION_ID_3, uint256(1), uint256(1), uint256(0));
        bytes memory message3 = abi.encode(uint16(10), payload3);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message3,
            address(0),
            bytes("")
        );

        // Query batch
        bytes[] memory conditionIds = new bytes[](3);
        conditionIds[0] = abi.encode(CONDITION_ID_1);
        conditionIds[1] = abi.encode(CONDITION_ID_2);
        conditionIds[2] = abi.encode(CONDITION_ID_3);

        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            pmResolver.getResolutions(conditionIds);

        assertTrue(resolved[0]);
        assertTrue(resolved[1]);
        assertTrue(resolved[2]);

        // YES wins
        assertEq(outcomes[0].yesWeight, 1);
        assertEq(outcomes[0].noWeight, 0);
        // Non-decisive (tie)
        assertEq(outcomes[1].yesWeight, 1);
        assertEq(outcomes[1].noWeight, 1);
        // NO wins
        assertEq(outcomes[2].yesWeight, 0);
        assertEq(outcomes[2].noWeight, 1);
    }

    // ============ View Functions Tests ============

    function test_getCondition() public {
        bytes memory payload =
            abi.encode(CONDITION_ID_1, uint256(100), uint256(30), uint256(70));
        bytes memory message = abi.encode(uint16(10), payload);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(polygonEid, address(polygonReader)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        IConditionalTokensConditionResolver.ConditionState memory state =
            pmResolver.getCondition(CONDITION_ID_1);

        assertEq(state.conditionId, CONDITION_ID_1);
        assertTrue(state.settled);
        assertFalse(state.invalid);
        assertFalse(state.nonDecisive);
        assertTrue(state.resolvedToYes); // 70 > 30
        assertEq(state.payoutDenominator, 100);
        assertEq(state.noPayout, 30);
        assertEq(state.yesPayout, 70);
    }

    // ============ Helper Functions ============

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
