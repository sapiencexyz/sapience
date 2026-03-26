// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    TestHelperOz5
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {
    LZConditionResolverUmaSide
} from "../src/resolvers/lz-uma/LZConditionResolverUmaSide.sol";
import {
    LZConditionResolver
} from "../src/resolvers/lz-uma/LZConditionResolver.sol";
import {
    ILZConditionResolverUmaSide
} from "../src/resolvers/lz-uma/interfaces/ILZConditionResolverUmaSide.sol";
import { LZTypes } from "../src/resolvers/shared/LZTypes.sol";
import { MockOptimisticOracleV3 } from "./mocks/MockOptimisticOracleV3.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import "forge-std/Test.sol";

/// @title LZConditionResolverUmaSideTest
/// @notice Test suite for LZConditionResolverUmaSide (UMA side)
contract LZConditionResolverUmaSideTest is TestHelperOz5 {
    // Users
    address private owner;
    address private asserter;
    address private unauthorizedUser;

    // Contracts
    LZConditionResolverUmaSide private umaResolver;
    LZConditionResolver private pmResolver;
    MockOptimisticOracleV3 private mockOracle;
    MockERC20 private bondToken;

    // LZ data
    uint32 private umaEid = 1;
    uint32 private pmEid = 2;

    // Test data
    uint256 public constant BOND_AMOUNT = 1 ether;
    uint64 public constant ASSERTION_LIVENESS = 3600;
    bytes public constant TEST_CLAIM = "Will ETH reach $10,000 by end of 2025?";
    uint256 public constant TEST_END_TIME = 1_735_689_600; // Dec 31, 2025
    bytes32 public conditionId;

    // Events
    event BridgeConfigUpdated(LZTypes.BridgeConfig config);
    event ConfigUpdated(
        address indexed bondCurrency,
        uint256 bondAmount,
        uint64 assertionLiveness
    );
    event OptimisticOracleV3Updated(address indexed optimisticOracleV3);
    event AsserterApproved(address indexed asserter);
    event AsserterRevoked(address indexed asserter);
    event BondWithdrawn(
        address indexed token, uint256 amount, address indexed to
    );
    event ConditionSubmittedToUMA(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId,
        address asserter,
        bytes claim,
        bool resolvedToYes
    );
    event ConditionResolvedFromUMA(
        bytes32 indexed conditionId,
        bytes32 indexed assertionId,
        bool resolvedToYes,
        bool assertedTruthfully
    );
    event ConditionDisputedFromUMA(
        bytes32 indexed conditionId, bytes32 indexed assertionId
    );

    function setUp() public override {
        owner = address(this);
        asserter = vm.addr(1);
        unauthorizedUser = vm.addr(2);

        vm.deal(owner, 100 ether);
        vm.deal(asserter, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy mock token
        bondToken = new MockERC20("Bond Token", "BOND", 18);
        bondToken.mint(owner, 1000 ether);

        // Deploy mock oracle
        mockOracle = new MockOptimisticOracleV3();

        // Deploy UMA-side resolver
        umaResolver = LZConditionResolverUmaSide(
            payable(_deployOApp(
                    type(LZConditionResolverUmaSide).creationCode,
                    abi.encode(
                        address(endpoints[umaEid]),
                        owner,
                        address(mockOracle),
                        ILZConditionResolverUmaSide.Settings({
                            bondCurrency: address(bondToken),
                            bondAmount: BOND_AMOUNT,
                            assertionLiveness: ASSERTION_LIVENESS
                        })
                    )
                ))
        );

        // Deploy PM-side resolver
        pmResolver = LZConditionResolver(
            payable(_deployOApp(
                    type(LZConditionResolver).creationCode,
                    abi.encode(address(endpoints[pmEid]), owner)
                ))
        );

        // Wire OApps
        address[] memory oapps = new address[](2);
        oapps[0] = address(umaResolver);
        oapps[1] = address(pmResolver);
        this.wireOApps(oapps);

        // Fund UMA resolver with ETH for LZ messages
        vm.deal(address(umaResolver), 100 ether);

        // Configure bridge
        umaResolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: pmEid, remoteBridge: address(pmResolver)
            })
        );
        pmResolver.setBridgeConfig(
            LZTypes.BridgeConfig({
                remoteEid: umaEid, remoteBridge: address(umaResolver)
            })
        );

        // Configure mock oracle callback
        mockOracle.setResolver(address(umaResolver));

        // Approve asserter
        umaResolver.approveAsserter(asserter);

        // Fund resolver with bond tokens
        bondToken.transfer(address(umaResolver), 100 ether);

        // Calculate condition ID
        conditionId =
            keccak256(abi.encodePacked(TEST_CLAIM, ":", TEST_END_TIME));

        // Set LZ receive cost (needs to be high enough for lzReceive execution)
        umaResolver.setLzReceiveCost(200_000);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(umaResolver.owner(), owner);
    }

    function test_constructor_setsOracle() public view {
        assertEq(umaResolver.getOptimisticOracleV3(), address(mockOracle));
    }

    function test_constructor_setsConfig() public view {
        ILZConditionResolverUmaSide.Settings memory cfg =
            umaResolver.getConfig();
        assertEq(cfg.bondCurrency, address(bondToken));
        assertEq(cfg.bondAmount, BOND_AMOUNT);
        assertEq(cfg.assertionLiveness, ASSERTION_LIVENESS);
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig_success() public {
        LZTypes.BridgeConfig memory newConfig = LZTypes.BridgeConfig({
            remoteEid: 999, remoteBridge: address(0x1234)
        });

        vm.expectEmit(false, false, false, true);
        emit BridgeConfigUpdated(newConfig);
        umaResolver.setBridgeConfig(newConfig);

        LZTypes.BridgeConfig memory retrieved = umaResolver.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999);
        assertEq(retrieved.remoteBridge, address(0x1234));
    }

    function test_setConfig_success() public {
        address newBondCurrency = address(0xBEEF);
        ILZConditionResolverUmaSide.Settings memory newConfig =
            ILZConditionResolverUmaSide.Settings({
                bondCurrency: newBondCurrency,
                bondAmount: 2 ether,
                assertionLiveness: 7200
            });

        vm.expectEmit(true, false, false, true);
        emit ConfigUpdated(newBondCurrency, 2 ether, 7200);
        umaResolver.setConfig(newConfig);

        ILZConditionResolverUmaSide.Settings memory retrieved =
            umaResolver.getConfig();
        assertEq(retrieved.bondCurrency, newBondCurrency);
        assertEq(retrieved.bondAmount, 2 ether);
        assertEq(retrieved.assertionLiveness, 7200);
    }

    function test_setOptimisticOracleV3_success() public {
        address newOracle = address(0xDEAD);

        vm.expectEmit(true, false, false, false);
        emit OptimisticOracleV3Updated(newOracle);
        umaResolver.setOptimisticOracleV3(newOracle);

        assertEq(umaResolver.getOptimisticOracleV3(), newOracle);
    }

    function test_configuration_revertIfNotOwner() public {
        vm.startPrank(unauthorizedUser);

        vm.expectRevert();
        umaResolver.setBridgeConfig(
            LZTypes.BridgeConfig({ remoteEid: 1, remoteBridge: address(0x1) })
        );

        vm.expectRevert();
        umaResolver.setConfig(
            ILZConditionResolverUmaSide.Settings({
                bondCurrency: address(0x1), bondAmount: 1, assertionLiveness: 1
            })
        );

        vm.expectRevert();
        umaResolver.setOptimisticOracleV3(address(0x1));

        vm.stopPrank();
    }

    // ============ Asserter Management Tests ============

    function test_approveAsserter_success() public {
        address newAsserter = vm.addr(100);

        vm.expectEmit(true, false, false, false);
        emit AsserterApproved(newAsserter);
        umaResolver.approveAsserter(newAsserter);

        assertTrue(umaResolver.isAsserterApproved(newAsserter));
    }

    function test_revokeAsserter_success() public {
        assertTrue(umaResolver.isAsserterApproved(asserter));

        vm.expectEmit(true, false, false, false);
        emit AsserterRevoked(asserter);
        umaResolver.revokeAsserter(asserter);

        assertFalse(umaResolver.isAsserterApproved(asserter));
    }

    function test_asserterManagement_revertIfNotOwner() public {
        vm.startPrank(unauthorizedUser);

        vm.expectRevert();
        umaResolver.approveAsserter(address(0x1));

        vm.expectRevert();
        umaResolver.revokeAsserter(asserter);

        vm.stopPrank();
    }

    // ============ Bond Management Tests ============

    function test_withdrawBond_success() public {
        address recipient = vm.addr(200);
        uint256 amount = 10 ether;

        vm.expectEmit(true, true, false, true);
        emit BondWithdrawn(address(bondToken), amount, recipient);
        umaResolver.withdrawBond(address(bondToken), amount, recipient);

        assertEq(bondToken.balanceOf(recipient), amount);
    }

    function test_withdrawBond_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        umaResolver.withdrawBond(address(bondToken), 1 ether, unauthorizedUser);
    }

    // ============ Submit Assertion Tests ============

    function test_submitAssertion_success() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);
        assertTrue(assertionId != bytes32(0));

        bytes32 mappedConditionId =
            umaResolver.getAssertionConditionId(assertionId);
        assertEq(mappedConditionId, conditionId);
    }

    function test_submitAssertion_resolvedToNo() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, false);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);
        assertTrue(assertionId != bytes32(0));
    }

    function test_submitAssertion_revertIfNotApproved() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(unauthorizedUser);
        vm.expectRevert(
            ILZConditionResolverUmaSide.OnlyApprovedAssertersCanCall.selector
        );
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);
    }

    function test_submitAssertion_revertIfNotEnded() public {
        vm.warp(TEST_END_TIME - 1);

        vm.prank(asserter);
        vm.expectRevert(ILZConditionResolverUmaSide.ConditionNotEnded.selector);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);
    }

    function test_submitAssertion_revertIfAlreadySubmitted() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        vm.prank(asserter);
        vm.expectRevert(
            ILZConditionResolverUmaSide.AssertionAlreadySubmitted.selector
        );
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, false);
    }

    function test_submitAssertion_revertIfInsufficientBond() public {
        // Create new resolver without bond funding
        LZConditionResolverUmaSide newResolver = LZConditionResolverUmaSide(
            payable(_deployOApp(
                    type(LZConditionResolverUmaSide).creationCode,
                    abi.encode(
                        address(endpoints[umaEid]),
                        owner,
                        address(mockOracle),
                        ILZConditionResolverUmaSide.Settings({
                            bondCurrency: address(bondToken),
                            bondAmount: BOND_AMOUNT,
                            assertionLiveness: ASSERTION_LIVENESS
                        })
                    )
                ))
        );

        newResolver.approveAsserter(asserter);

        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        vm.expectRevert();
        newResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);
    }

    // ============ UMA Callback Tests ============

    function test_assertionResolvedCallback_truthful() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        // Resolve via mock oracle (will send LZ message)
        mockOracle.resolveAssertion(assertionId, true);

        // Mappings should be cleaned up
        assertEq(umaResolver.getConditionAssertionId(conditionId), bytes32(0));
        assertEq(umaResolver.getAssertionConditionId(assertionId), bytes32(0));

        // Verify packets are pending (LZ message was sent)
        // The actual delivery would happen via verifyPackets in a full integration test
    }

    function test_assertionResolvedCallback_untruthful() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        // Resolve as untruthful (no LZ message sent)
        mockOracle.resolveAssertion(assertionId, false);

        // Mappings should still be cleaned up
        assertEq(umaResolver.getConditionAssertionId(conditionId), bytes32(0));
        assertEq(umaResolver.getAssertionConditionId(assertionId), bytes32(0));
    }

    function test_assertionResolvedCallback_revertIfNotOracle() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        vm.prank(unauthorizedUser);
        vm.expectRevert(
            ILZConditionResolverUmaSide.OnlyOptimisticOracleV3CanCall.selector
        );
        umaResolver.assertionResolvedCallback(assertionId, true);
    }

    function test_assertionResolvedCallback_revertIfInvalidAssertion() public {
        vm.prank(address(mockOracle));
        vm.expectRevert(ILZConditionResolverUmaSide.InvalidAssertionId.selector);
        umaResolver.assertionResolvedCallback(keccak256("invalid"), true);
    }

    function test_assertionDisputedCallback_success() public {
        vm.warp(TEST_END_TIME + 1);

        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        // Dispute via mock oracle
        mockOracle.disputeAssertion(assertionId);

        // Mappings should remain (disputes don't clean up)
        assertEq(umaResolver.getConditionAssertionId(conditionId), assertionId);
        assertEq(umaResolver.getAssertionConditionId(assertionId), conditionId);
    }

    function test_assertionDisputedCallback_revertIfNotOracle() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(
            ILZConditionResolverUmaSide.OnlyOptimisticOracleV3CanCall.selector
        );
        umaResolver.assertionDisputedCallback(keccak256("any"));
    }

    function test_assertionDisputedCallback_revertIfInvalidAssertion() public {
        vm.prank(address(mockOracle));
        vm.expectRevert(ILZConditionResolverUmaSide.InvalidAssertionId.selector);
        umaResolver.assertionDisputedCallback(keccak256("invalid"));
    }

    // ============ View Functions Tests ============

    function test_getConditionAssertionId_notExists() public view {
        assertEq(
            umaResolver.getConditionAssertionId(keccak256("nonexistent")),
            bytes32(0)
        );
    }

    function test_getAssertionConditionId_notExists() public view {
        assertEq(
            umaResolver.getAssertionConditionId(keccak256("nonexistent")),
            bytes32(0)
        );
    }

    // ============ ETH Management Tests ============

    function test_ethManagement_depositAndWithdraw() public {
        umaResolver.depositETH{ value: 1 ether }();
        assertEq(umaResolver.getETHBalance(), 101 ether); // 100 from setup + 1

        uint256 ownerBalanceBefore = owner.balance;
        umaResolver.withdrawETH(1 ether);
        assertEq(owner.balance, ownerBalanceBefore + 1 ether);
    }

    // ============ Full Integration Test ============

    function test_fullFlow_submitAndResolve() public {
        vm.warp(TEST_END_TIME + 1);

        // Submit assertion
        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, true);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        // Resolve via oracle
        mockOracle.resolveAssertion(assertionId, true);

        // Verify and deliver packets to PM side
        verifyPackets(pmEid, addressToBytes32(address(pmResolver)));

        // Check PM resolver received the resolution
        assertTrue(pmResolver.isFinalized(abi.encode(conditionId)));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(conditionId));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_fullFlow_submitAndResolveNo() public {
        vm.warp(TEST_END_TIME + 1);

        // Submit assertion for NO
        vm.prank(asserter);
        umaResolver.submitAssertion(TEST_CLAIM, TEST_END_TIME, false);

        bytes32 assertionId = umaResolver.getConditionAssertionId(conditionId);

        // Resolve via oracle
        mockOracle.resolveAssertion(assertionId, true);

        // Verify and deliver packets
        verifyPackets(pmEid, addressToBytes32(address(pmResolver)));

        // Check resolution
        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(conditionId));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 1);
    }
}
