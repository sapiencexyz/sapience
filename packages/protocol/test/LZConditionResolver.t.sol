// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    TestHelperOz5
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import { Origin } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {
    LZConditionResolver
} from "../src/resolvers/lz-uma/LZConditionResolver.sol";
import { LZTypes } from "../src/resolvers/shared/LZTypes.sol";
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import "forge-std/Test.sol";

/// @title LZConditionResolverTest
/// @notice Test suite for LZConditionResolver (PM side)
contract LZConditionResolverTest is TestHelperOz5 {
    // Users
    address private owner;
    address private unauthorizedUser;

    // Contracts
    LZConditionResolver private pmResolver;
    LZConditionResolver private umaResolver; // Mock sender

    // LZ data
    uint32 private pmEid = 1;
    uint32 private umaEid = 2;

    // Test data
    bytes32 public constant CONDITION_ID_1 = keccak256("condition-1");
    bytes32 public constant CONDITION_ID_2 = keccak256("condition-2");

    // Events
    event ConditionResolutionDetail(
        bytes32 indexed conditionId,
        bool resolvedToYes,
        bool assertedTruthfully,
        uint256 resolutionTime
    );

    // Unified event from IConditionResolver (different signature, same name is fine)
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

        // Deploy PM-side resolver
        pmResolver = LZConditionResolver(
            payable(_deployOApp(
                    type(LZConditionResolver).creationCode,
                    abi.encode(address(endpoints[pmEid]), owner)
                ))
        );

        // Deploy mock UMA-side resolver (for sending messages)
        umaResolver = LZConditionResolver(
            payable(_deployOApp(
                    type(LZConditionResolver).creationCode,
                    abi.encode(address(endpoints[umaEid]), owner)
                ))
        );

        // Wire OApps
        address[] memory oapps = new address[](2);
        oapps[0] = address(pmResolver);
        oapps[1] = address(umaResolver);
        this.wireOApps(oapps);

        // Configure bridge
        pmResolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: umaEid, remoteBridge: address(umaResolver)
            })
        );

        umaResolver.setBridgeConfig(
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

    // ============ ETH Management Tests ============

    function test_depositETH() public {
        uint256 balanceBefore = address(pmResolver).balance;
        pmResolver.depositETH{ value: 1 ether }();
        assertEq(address(pmResolver).balance, balanceBefore + 1 ether);
    }

    function test_withdrawETH() public {
        pmResolver.depositETH{ value: 1 ether }();
        uint256 ownerBalanceBefore = owner.balance;

        pmResolver.withdrawETH(0.5 ether);

        assertEq(owner.balance, ownerBalanceBefore + 0.5 ether);
    }

    function test_withdrawETH_revertIfNotOwner() public {
        pmResolver.depositETH{ value: 1 ether }();

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        pmResolver.withdrawETH(0.5 ether);
    }

    function test_setLzReceiveCost() public {
        pmResolver.setLzReceiveCost(50_000);
        assertEq(pmResolver.getLzReceiveCost(), 50_000);
    }

    function test_setGasThresholds() public {
        pmResolver.setGasThresholds(0.2 ether, 0.1 ether);
        (uint256 warning, uint256 critical) = pmResolver.getGasThresholds();
        assertEq(warning, 0.2 ether);
        assertEq(critical, 0.1 ether);
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

    function test_getCondition_notSettled() public view {
        (bool settled, bool resolvedToYes) =
            pmResolver.getCondition(CONDITION_ID_1);
        assertFalse(settled);
        assertFalse(resolvedToYes);
    }

    // ============ LayerZero Message Handling Tests ============

    function test_lzReceive_conditionResolvedYes() public {
        // Simulate message from UMA side
        bytes memory payload = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message = abi.encode(uint16(8), payload); // CMD_CONDITION_RESOLVED = 8

        // Expect unified ConditionResolved event
        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(CONDITION_ID_1), false, true);

        // Use LZ test helper to simulate receive
        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        // Verify condition is resolved
        assertTrue(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_lzReceive_conditionResolvedNo() public {
        bytes memory payload = abi.encode(CONDITION_ID_1, false, true);
        bytes memory message = abi.encode(uint16(8), payload);

        vm.expectEmit(false, false, false, true);
        emit ConditionResolved(abi.encode(CONDITION_ID_1), false, false);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
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

    function test_lzReceive_notAssertedTruthfully() public {
        bytes memory payload = abi.encode(CONDITION_ID_1, true, false);
        bytes memory message = abi.encode(uint16(8), payload);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        // Condition should NOT be settled since assertedTruthfully=false
        assertFalse(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));
    }

    function test_lzReceive_revertIfInvalidSourceChain() public {
        bytes memory payload = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message = abi.encode(uint16(8), payload);

        // Use wrong source chain
        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(999, address(umaResolver)), // Wrong EID
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function test_lzReceive_revertIfInvalidSender() public {
        bytes memory payload = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message = abi.encode(uint16(8), payload);

        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(0xBAD)), // Wrong sender
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function test_lzReceive_revertIfInvalidCommandType() public {
        bytes memory payload = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message = abi.encode(uint16(999), payload); // Invalid command

        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    function test_lzReceive_revertIfAlreadySettled() public {
        // First resolution
        bytes memory payload = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message = abi.encode(uint16(8), payload);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );

        // Try to resolve again
        vm.prank(address(endpoints[pmEid]));
        vm.expectRevert();
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message,
            address(0),
            bytes("")
        );
    }

    // ============ Batch Resolution Tests ============

    function test_getResolutions_batch() public {
        // Resolve first condition
        bytes memory payload1 = abi.encode(CONDITION_ID_1, true, true);
        bytes memory message1 = abi.encode(uint16(8), payload1);

        vm.prank(address(endpoints[pmEid]));
        pmResolver.lzReceive(
            _createOrigin(umaEid, address(umaResolver)),
            bytes32(0),
            message1,
            address(0),
            bytes("")
        );

        // Query batch
        bytes[] memory conditionIds = new bytes[](2);
        conditionIds[0] = abi.encode(CONDITION_ID_1);
        conditionIds[1] = abi.encode(CONDITION_ID_2);

        (bool[] memory resolved, IV2Types.OutcomeVector[] memory outcomes) =
            pmResolver.getResolutions(conditionIds);

        assertTrue(resolved[0]);
        assertFalse(resolved[1]);
        assertEq(outcomes[0].yesWeight, 1);
        assertEq(outcomes[0].noWeight, 0);
        assertEq(outcomes[1].yesWeight, 0);
        assertEq(outcomes[1].noWeight, 0);
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
