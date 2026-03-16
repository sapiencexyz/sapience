// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    TestHelperOz5
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
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
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import { LZTypes } from "../src/resolvers/shared/LZTypes.sol";
import { MockConditionalTokens } from "./mocks/MockConditionalTokens.sol";
import "forge-std/Test.sol";

/// @title ConditionalTokensReaderTest
/// @notice Test suite for ConditionalTokensReader
contract ConditionalTokensReaderTest is TestHelperOz5 {
    // Users
    address private owner;
    address private user;
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

    // Events
    event ResolutionRequested(
        bytes32 indexed conditionId, bytes32 guid, uint256 timestamp
    );
    event ResolutionSent(
        bytes32 indexed conditionId,
        uint256 payoutDenominator,
        uint256 noPayout,
        uint256 yesPayout,
        bytes32 guid,
        uint256 timestamp
    );
    event ConfigUpdated(address conditionalTokens);
    event BridgeConfigUpdated(LZTypes.BridgeConfig config);

    function setUp() public override {
        owner = address(this);
        user = vm.addr(1);
        unauthorizedUser = vm.addr(999);

        vm.deal(owner, 100 ether);
        vm.deal(user, 100 ether);
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

        // Set up a resolved YES condition
        mockCT.setYesCondition(CONDITION_ID_1);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(polygonReader.owner(), owner);
    }

    function test_constructor_setsConfig() public view {
        (address ct) = polygonReader.config();
        assertEq(ct, address(mockCT));
    }

    // ============ Configuration Tests ============

    function test_setConfig_success() public {
        address newCT = address(0x1234);

        vm.expectEmit(true, false, false, false);
        emit ConfigUpdated(newCT);
        polygonReader.setConfig(
            IConditionalTokensReader.Settings({ conditionalTokens: newCT })
        );

        (address ct) = polygonReader.config();
        assertEq(ct, newCT);
    }

    function test_setConfig_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        polygonReader.setConfig(
            IConditionalTokensReader.Settings({
                conditionalTokens: address(0x1)
            })
        );
    }

    function test_setBridgeConfig_success() public {
        LZTypes.BridgeConfig memory newConfig = LZTypes.BridgeConfig({
            remoteEid: 999, remoteBridge: address(0x1234)
        });

        vm.expectEmit(false, false, false, true);
        emit BridgeConfigUpdated(newConfig);
        polygonReader.setBridgeConfig(newConfig);

        LZTypes.BridgeConfig memory retrieved = polygonReader.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999);
        assertEq(retrieved.remoteBridge, address(0x1234));
    }

    // ============ canRequestResolution Tests ============

    function test_canRequestResolution_validAndResolved() public view {
        assertTrue(polygonReader.canRequestResolution(CONDITION_ID_1));
    }

    function test_canRequestResolution_zeroConditionId() public view {
        assertFalse(polygonReader.canRequestResolution(bytes32(0)));
    }

    function test_canRequestResolution_notResolved() public {
        mockCT.setUnresolvedCondition(CONDITION_ID_2);
        assertFalse(polygonReader.canRequestResolution(CONDITION_ID_2));
    }

    function test_canRequestResolution_notBinary() public {
        mockCT.setNonBinaryCondition(CONDITION_ID_2);
        assertFalse(polygonReader.canRequestResolution(CONDITION_ID_2));
    }

    function test_canRequestResolution_tie() public {
        mockCT.setTieCondition(CONDITION_ID_2);
        assertTrue(polygonReader.canRequestResolution(CONDITION_ID_2));
    }

    // ============ getConditionResolution Tests ============

    function test_getConditionResolution() public view {
        IConditionalTokensReader.ConditionData memory data =
            polygonReader.getConditionResolution(CONDITION_ID_1);

        assertEq(data.slotCount, 2);
        assertEq(data.payoutDenominator, 1);
        assertEq(data.yesPayout, 1);
        assertEq(data.noPayout, 0);
    }

    // ============ quoteResolution Tests ============

    function test_quoteResolution() public view {
        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_1);
        assertTrue(fee.nativeFee > 0);
    }

    // ============ requestResolution Tests ============

    function test_requestResolution_revertIfZeroConditionId() public {
        vm.expectRevert(IConditionalTokensReader.InvalidConditionId.selector);
        polygonReader.requestResolution{ value: 1 ether }(bytes32(0));
    }

    function test_requestResolution_revertIfNotBinary() public {
        mockCT.setNonBinaryCondition(CONDITION_ID_2);

        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalTokensReader.ConditionIsNotBinary.selector,
                CONDITION_ID_2
            )
        );
        polygonReader.requestResolution{ value: 1 ether }(CONDITION_ID_2);
    }

    function test_requestResolution_revertIfNotResolved() public {
        mockCT.setUnresolvedCondition(CONDITION_ID_2);

        vm.expectRevert(
            abi.encodeWithSelector(
                IConditionalTokensReader.ConditionNotResolved.selector,
                CONDITION_ID_2
            )
        );
        polygonReader.requestResolution{ value: 1 ether }(CONDITION_ID_2);
    }

    function test_requestResolution_tieAllowed() public {
        mockCT.setTieCondition(CONDITION_ID_2);

        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_2);
        vm.prank(user);
        polygonReader.requestResolution{ value: fee.nativeFee }(CONDITION_ID_2);
        // Should not revert - ties are now allowed
    }

    function test_requestResolution_revertIfInsufficientFee() public {
        vm.expectRevert();
        polygonReader.requestResolution{ value: 0 }(CONDITION_ID_1);
    }

    function test_requestResolution_success() public {
        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_1);

        vm.prank(user);
        polygonReader.requestResolution{ value: fee.nativeFee }(CONDITION_ID_1);

        // Message should be pending
    }

    // ============ ETH Management Tests ============

    function test_depositETH() public {
        uint256 balanceBefore = polygonReader.getETHBalance();
        (bool success,) = address(polygonReader).call{ value: 1 ether }("");
        assertTrue(success);
        assertEq(polygonReader.getETHBalance(), balanceBefore + 1 ether);
    }

    function test_withdrawETH() public {
        (bool success,) = address(polygonReader).call{ value: 1 ether }("");
        assertTrue(success);

        uint256 ownerBalanceBefore = owner.balance;
        polygonReader.withdrawETH(0.5 ether);
        assertEq(owner.balance, ownerBalanceBefore + 0.5 ether);
    }

    function test_withdrawETH_revertIfNotOwner() public {
        (bool success,) = address(polygonReader).call{ value: 1 ether }("");
        assertTrue(success);

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        polygonReader.withdrawETH(0.5 ether);
    }

    function test_withdrawETH_revertIfInsufficientBalance() public {
        vm.expectRevert();
        polygonReader.withdrawETH(1000 ether);
    }

    // ============ Full Integration Test ============

    function test_fullFlow_requestAndResolve() public {
        // Set up YES condition
        mockCT.setYesCondition(CONDITION_ID_1);

        // Get quote
        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_1);

        // Request resolution
        vm.prank(user);
        polygonReader.requestResolution{ value: fee.nativeFee }(CONDITION_ID_1);

        // Verify and deliver packets
        verifyPackets(pmEid, addressToBytes32(address(pmResolver)));

        // Check PM resolver received the resolution
        assertTrue(pmResolver.isFinalized(abi.encode(CONDITION_ID_1)));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_1));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 0);
    }

    function test_fullFlow_noWins() public {
        mockCT.setNoCondition(CONDITION_ID_2);

        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_2);

        vm.prank(user);
        polygonReader.requestResolution{ value: fee.nativeFee }(CONDITION_ID_2);

        verifyPackets(pmEid, addressToBytes32(address(pmResolver)));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_2));
        assertTrue(isResolved);
        assertEq(outcome.yesWeight, 0);
        assertEq(outcome.noWeight, 1);
    }

    function test_fullFlow_tie() public {
        mockCT.setTieCondition(CONDITION_ID_2);

        MessagingFee memory fee = polygonReader.quoteResolution(CONDITION_ID_2);

        vm.prank(user);
        polygonReader.requestResolution{ value: fee.nativeFee }(CONDITION_ID_2);

        verifyPackets(pmEid, addressToBytes32(address(pmResolver)));

        // Should be finalized as non-decisive
        assertTrue(pmResolver.isFinalized(abi.encode(CONDITION_ID_2)));

        (bool isResolved, IV2Types.OutcomeVector memory outcome) =
            pmResolver.getResolution(abi.encode(CONDITION_ID_2));
        assertTrue(isResolved);
        // Non-decisive: both weights are 1
        assertEq(outcome.yesWeight, 1);
        assertEq(outcome.noWeight, 1);

        // Verify condition state
        IConditionalTokensConditionResolver.ConditionState memory state =
            pmResolver.getCondition(CONDITION_ID_2);
        assertTrue(state.nonDecisive);
        assertFalse(state.invalid);
    }
}

// Need to import MessagingFee for the test
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
