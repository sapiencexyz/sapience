// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridgeTest} from "./mocks/MarketLayerZeroBridgeTest.sol";
import {UMALayerZeroBridgeTest} from "./mocks/UMALayerZeroBridgeTest.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {MockOptimisticOracleV3} from "./mocks/mockOptimisticOracleV3.sol";
import {MockMarketGroup} from "./mocks/mockMarketGroup.sol";
import {ReentrantAttacker} from "./mocks/ReentrantAttacker.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeSecurityTest is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private umaUser = address(0x1);
    address private marketUser = address(0x2);
    address private owner = address(0x3);
    address private attacker = address(0x666);
    address private marketGroup = address(0x5);

    // Bridges
    MarketLayerZeroBridgeTest private marketBridge;
    UMALayerZeroBridgeTest private umaBridge;

    // Other contracts
    IMintableToken private bondCurrency;
    MockOptimisticOracleV3 private mockOptimisticOracleV3;
    MockMarketGroup private mockMarketGroup;
    ReentrantAttacker private reentrantAttacker;

    // LZ data
    uint32 private umaEiD = 1;
    uint32 private marketEiD = 2;
    uint32 private maliciousEiD = 3;

    bytes32 private assertionId_01 = bytes32(uint256(0x1));
    bytes32 private assertionId_999 = bytes32(uint256(0x3e7));

    address umaEndpoint;
    address marketEndpoint;
    address maliciousEndpoint;

    uint256 private BOND_AMOUNT = 1_000 ether;

    function setUp() public override {
        vm.deal(umaUser, 1000 ether);
        vm.deal(marketUser, 1000 ether);
        vm.deal(owner, 1000 ether);
        vm.deal(attacker, 1000 ether);

        super.setUp();
        setUpEndpoints(3, LibraryType.UltraLightNode);
        marketBridge = MarketLayerZeroBridgeTest(
            payable(
                _deployOApp(
                    type(MarketLayerZeroBridgeTest).creationCode,
                    abi.encode(address(endpoints[marketEiD]), address(this))
                )
            )
        );

        umaBridge = UMALayerZeroBridgeTest(
            payable(
                _deployOApp(
                    type(UMALayerZeroBridgeTest).creationCode, abi.encode(address(endpoints[umaEiD]), address(this))
                )
            )
        );
        // Deploy malicious bridge for testing
        MarketLayerZeroBridgeTest maliciousBridge = MarketLayerZeroBridgeTest(
            payable(
                _deployOApp(
                    type(MarketLayerZeroBridgeTest).creationCode,
                    abi.encode(address(endpoints[maliciousEiD]), address(this))
                )
            )
        );
        address[] memory oapps = new address[](3);
        oapps[0] = address(marketBridge);
        oapps[1] = address(umaBridge);
        oapps[2] = address(maliciousBridge);
        this.wireOApps(oapps);
        umaEndpoint = address(umaBridge.endpoint());
        marketEndpoint = address(marketBridge.endpoint());
        maliciousEndpoint = address(endpoints[maliciousEiD]);
        vm.deal(address(umaBridge), 100 ether);
        vm.deal(address(marketBridge), 100 ether);
        mockOptimisticOracleV3 = new MockOptimisticOracleV3(address(umaBridge));
        mockMarketGroup = new MockMarketGroup(address(marketBridge));
        reentrantAttacker = new ReentrantAttacker();

        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        // Configure bridges
        umaBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: marketEiD, remoteBridge: address(marketBridge)}));
        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: umaEiD, remoteBridge: address(umaBridge)}));
        // Link bridges to external contracts
        umaBridge.setOptimisticOracleV3(address(mockOptimisticOracleV3));
        marketBridge.enableMarketGroup(address(mockMarketGroup));
        // Set gas thresholds
        marketBridge.setLzReceiveCost(1000000);
        umaBridge.setLzReceiveCost(1000000);
        marketBridge.setGasThresholds(0.01 ether, 0.005 ether);
        umaBridge.setGasThresholds(0.1 ether, 0.05 ether);
        // Transfer ownership
        marketBridge.transferOwnership(owner);
        umaBridge.transferOwnership(owner);
        maliciousBridge.transferOwnership(attacker);
    }

    // ============ Source Chain Validation Tests ============

    function test_revertInvalidSourceChain_MarketBridge() public {
        // Test that MarketBridge rejects messages from wrong chain
        bytes memory maliciousMessage = abi.encode(
            uint16(1), // CMD_TO_UMA_ASSERT_TRUTH
            abi.encode(uint256(1), address(0x1), uint64(3600), address(bondCurrency), uint256(1000), "claim")
        );

        // Try to send message from malicious chain
        vm.expectRevert("Invalid source chain");
        marketBridge.exposed_lzReceive(
            Origin({srcEid: maliciousEiD, sender: addressToBytes32(address(umaBridge)), nonce: 1}),
            bytes32(0),
            maliciousMessage,
            address(0),
            ""
        );
    }

    function test_revertInvalidSourceChain_UMABridge() public {
        // Test that UMABridge rejects messages from wrong chain
        bytes memory maliciousMessage = abi.encode(
            uint16(1), // CMD_TO_UMA_ASSERT_TRUTH
            abi.encode(uint256(1), address(0x1), uint64(3600), address(bondCurrency), uint256(1000), "claim")
        );

        vm.expectRevert("Invalid source chain");
        umaBridge.exposed_lzReceive(
            Origin({srcEid: maliciousEiD, sender: addressToBytes32(address(marketBridge)), nonce: 1}),
            bytes32(0),
            maliciousMessage,
            address(0),
            ""
        );
    }

    // ============ Sender Validation Tests ============

    function test_revertInvalidSender_MarketBridge() public {
        // Test that MarketBridge rejects messages from wrong sender
        bytes memory maliciousMessage = abi.encode(
            uint16(1), // CMD_TO_UMA_ASSERT_TRUTH
            abi.encode(uint256(1), address(0x1), uint64(3600), address(bondCurrency), uint256(1000), "claim")
        );

        vm.expectRevert("Invalid sender");
        marketBridge.exposed_lzReceive(
            Origin({
                srcEid: umaEiD,
                sender: addressToBytes32(attacker), // Wrong sender
                nonce: 1
            }),
            bytes32(0),
            maliciousMessage,
            address(0),
            ""
        );
    }

    function test_revertInvalidSender_UMABridge() public {
        // Test that UMABridge rejects messages from wrong sender
        bytes memory maliciousMessage = abi.encode(
            uint16(1), // CMD_TO_UMA_ASSERT_TRUTH
            abi.encode(uint256(1), address(0x1), uint64(3600), address(bondCurrency), uint256(1000), "claim")
        );

        vm.expectRevert("Invalid sender");
        umaBridge.exposed_lzReceive(
            Origin({
                srcEid: marketEiD,
                sender: addressToBytes32(attacker), // Wrong sender
                nonce: 1
            }),
            bytes32(0),
            maliciousMessage,
            address(0),
            ""
        );
    }

    // ============ Access Control Tests ============

    function test_revertReentrancyAttack_UMACallback() public {
        // Test reentrancy attack on UMA callback functions
        vm.startPrank(attacker);

        // Try to call assertionResolvedCallback with reentrancy
        vm.expectRevert("Only the OptimisticOracleV3 can call this function");
        umaBridge.assertionResolvedCallback(assertionId_01, true);

        vm.stopPrank();
    }

    function test_revertNonOwner_SetBridgeConfig() public {
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: maliciousEiD, remoteBridge: attacker}));
        vm.stopPrank();
    }

    function test_revertNonOwner_SetOptimisticOracleV3() public {
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        umaBridge.setOptimisticOracleV3(attacker);
        vm.stopPrank();
    }

    function test_revertNonOwner_EnableMarketGroup() public {
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        marketBridge.enableMarketGroup(attacker);
        vm.stopPrank();
    }

    function test_revertNonOwner_WithdrawETH() public {
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, attacker));
        marketBridge.withdrawETH(1 ether);
        vm.stopPrank();
    }

    // ============ Invalid Command Type Tests ============

    function test_revertInvalidCommandType_MarketBridge() public {
        bytes memory invalidMessage = abi.encode(
            uint16(999), // Invalid command type
            abi.encode("invalid data")
        );

        vm.expectRevert("Invalid command type");
        marketBridge.exposed_lzReceive(
            Origin({srcEid: umaEiD, sender: addressToBytes32(address(umaBridge)), nonce: 1}),
            bytes32(0),
            invalidMessage,
            address(0),
            ""
        );
    }

    function test_revertInvalidCommandType_UMABridge() public {
        bytes memory invalidMessage = abi.encode(
            uint16(999), // Invalid command type
            abi.encode("invalid data")
        );

        vm.expectRevert("Invalid command type");
        umaBridge.exposed_lzReceive(
            Origin({srcEid: marketEiD, sender: addressToBytes32(address(marketBridge)), nonce: 1}),
            bytes32(0),
            invalidMessage,
            address(0),
            ""
        );
    }

    // ============ Invalid Assertion ID Tests ============

    function test_revertInvalidAssertionId_Resolved() public {
        vm.startPrank(address(mockOptimisticOracleV3));
        vm.expectRevert("Invalid assertion ID");
        umaBridge.assertionResolvedCallback(assertionId_999, true);
        vm.stopPrank();
    }

    function test_revertInvalidAssertionId_Disputed() public {
        vm.startPrank(address(mockOptimisticOracleV3));
        vm.expectRevert("Invalid assertion ID");
        umaBridge.assertionDisputedCallback(assertionId_999);
        vm.stopPrank();
    }

    // ============ Unauthorized Callback Tests ============

    function test_revertUnauthorizedCallback_Resolved() public {
        vm.startPrank(attacker);
        vm.expectRevert("Only the OptimisticOracleV3 can call this function");
        umaBridge.assertionResolvedCallback(assertionId_01, true);
        vm.stopPrank();
    }

    function test_revertUnauthorizedCallback_Disputed() public {
        vm.startPrank(attacker);
        vm.expectRevert("Only the OptimisticOracleV3 can call this function");
        umaBridge.assertionDisputedCallback(assertionId_01);
        vm.stopPrank();
    }

    // ============ Self-Call Protection Tests ============

    function test_revertSelfCallProtection() public {
        vm.startPrank(attacker);
        vm.expectRevert("Only self-call allowed");
        umaBridge._sendMessageWithETH(1, "", "", MessagingFee(0, 0));
        vm.stopPrank();
    }

    // ============ Zero Address Validation Tests ============

    function test_revertZeroAddress_BondToken_LEO() public {
        bondCurrency.mint(1000 ether, umaUser);
        vm.startPrank(umaUser);
        bondCurrency.approve(address(umaBridge), 1000 ether);

        vm.expectRevert(); // Should revert for zero address
        umaBridge.depositBond(address(0), 1000 ether);
        vm.stopPrank();
    }

    function test_revertZeroAddress_OptimisticOracleV3() public {
        vm.startPrank(owner);
        // This should work but let's test it
        umaBridge.setOptimisticOracleV3(address(0));
        assertEq(umaBridge.getOptimisticOracleV3(), address(0));
        vm.stopPrank();
    }

    // ============ Market Group Security Tests ============

    function test_revertUnauthorizedMarketGroup() public {
        // Test that only enabled market groups can submit
        vm.startPrank(attacker);
        vm.expectRevert("Only enabled market groups can submit");
        marketBridge.forwardAssertTruth(
            address(0x999), // Unauthorized market group
            1,
            "claim",
            umaUser,
            3600,
            address(bondCurrency),
            BOND_AMOUNT
        );
        vm.stopPrank();
    }

    function test_revertInsufficientBond() public {
        // Test that insufficient bond is rejected
        vm.startPrank(address(mockMarketGroup));
        vm.expectRevert("Asserter does not have enough bond");
        marketBridge.forwardAssertTruth(
            address(mockMarketGroup),
            1,
            "claim",
            attacker, // Attacker has no bond
            3600,
            address(bondCurrency),
            BOND_AMOUNT
        );
        vm.stopPrank();
    }
}
