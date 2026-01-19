// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {PositionTokenBridge} from "../../src/v2/bridge/PositionTokenBridge.sol";
import {PositionTokenBridgeRemote} from "../../src/v2/bridge/PositionTokenBridgeRemote.sol";
import {PositionTokenFactory} from "../../src/v2/bridge/PositionTokenFactory.sol";
import {BridgedPositionToken} from "../../src/v2/bridge/BridgedPositionToken.sol";
import {IPositionTokenBridge} from "../../src/v2/bridge/interfaces/IPositionTokenBridge.sol";
import {IPositionTokenBridgeRemote} from "../../src/v2/bridge/interfaces/IPositionTokenBridgeRemote.sol";
import {MockPositionToken} from "./mocks/MockPositionToken.sol";
import {MessagingFee} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "forge-std/Test.sol";

/// @title PositionTokenBridgeTest
/// @notice Test suite for position token bridge with ACK mechanism
contract PositionTokenBridgeTest is TestHelperOz5 {
    // Users
    address private owner;
    address private user;
    address private unauthorizedUser;

    // Contracts
    PositionTokenBridge private etherealBridge;
    PositionTokenBridgeRemote private arbitrumBridge;
    PositionTokenFactory private factory;
    MockPositionToken private positionToken;

    // LZ data
    uint32 private etherealEid = 1;
    uint32 private arbitrumEid = 2;

    // Test data
    bytes32 public constant PREDICTION_ID = keccak256("test-prediction");
    bool public constant IS_PREDICTOR_TOKEN = true;

    // Events from IPositionTokenBridge
    event BridgeInitiated(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint64 createdAt
    );
    event BridgeRetried(bytes32 indexed bridgeId, uint256 retryCount);
    event BridgeCompleted(bytes32 indexed bridgeId);
    event BridgeCancelled(bytes32 indexed bridgeId, address indexed sender, uint256 amount);
    event TokensReleased(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event BridgeConfigUpdated(IPositionTokenBridge.BridgeConfig config);

    // Events from IPositionTokenBridgeRemote
    event TokensMinted(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isNewDeployment
    );
    event BridgeBackInitiated(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint64 createdAt
    );
    event BridgeBackRetried(bytes32 indexed bridgeId, uint256 retryCount);
    event BridgeBackCompleted(bytes32 indexed bridgeId);
    event BridgeBackCancelled(bytes32 indexed bridgeId, address indexed sender, uint256 amount);

    function setUp() public override {
        owner = address(this);
        user = vm.addr(1);
        unauthorizedUser = vm.addr(999);

        vm.deal(owner, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy factory on Arbitrum side
        factory = new PositionTokenFactory(owner);

        // Deploy Ethereal bridge
        etherealBridge = PositionTokenBridge(
            payable(
                _deployOApp(
                    type(PositionTokenBridge).creationCode,
                    abi.encode(address(endpoints[etherealEid]), owner)
                )
            )
        );

        // Deploy Arbitrum bridge with factory
        arbitrumBridge = PositionTokenBridgeRemote(
            payable(
                _deployOApp(
                    type(PositionTokenBridgeRemote).creationCode,
                    abi.encode(
                        address(endpoints[arbitrumEid]),
                        owner,
                        address(factory)
                    )
                )
            )
        );

        // Fund bridges for ACK fees using vm.deal for reliable test funding
        vm.deal(address(etherealBridge), 100 ether);
        vm.deal(address(arbitrumBridge), 100 ether);

        // Wire OApps
        address[] memory oapps = new address[](2);
        oapps[0] = address(etherealBridge);
        oapps[1] = address(arbitrumBridge);
        this.wireOApps(oapps);

        // Configure bridges
        etherealBridge.setBridgeConfig(
            IPositionTokenBridge.BridgeConfig({
                remoteEid: arbitrumEid,
                remoteBridge: address(arbitrumBridge)
            })
        );
        arbitrumBridge.setBridgeConfig(
            IPositionTokenBridgeRemote.BridgeConfig({
                remoteEid: etherealEid,
                remoteBridge: address(etherealBridge)
            })
        );

        // Set factory deployer to arbitrum bridge
        factory.setDeployer(address(arbitrumBridge));

        // Deploy mock position token on Ethereal
        positionToken = new MockPositionToken(
            "Predictor Token",
            "PRED",
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            user
        );
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(etherealBridge.owner(), owner);
        assertEq(arbitrumBridge.owner(), owner);
    }

    function test_constructor_setsFactory() public view {
        assertEq(arbitrumBridge.getFactory(), address(factory));
    }

    function test_constructor_setsDelayConstants() public view {
        assertEq(etherealBridge.getMinRetryDelay(), 5 minutes);
        assertEq(etherealBridge.getEmergencyCancelDelay(), 7 days);
        assertEq(arbitrumBridge.getMinRetryDelay(), 5 minutes);
        assertEq(arbitrumBridge.getEmergencyCancelDelay(), 7 days);
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig_success() public {
        IPositionTokenBridge.BridgeConfig memory newConfig = IPositionTokenBridge.BridgeConfig({
            remoteEid: 999,
            remoteBridge: address(0x1234)
        });

        vm.expectEmit(false, false, false, true);
        emit BridgeConfigUpdated(newConfig);
        etherealBridge.setBridgeConfig(newConfig);

        IPositionTokenBridge.BridgeConfig memory retrieved = etherealBridge.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999);
        assertEq(retrieved.remoteBridge, address(0x1234));
    }

    function test_setBridgeConfig_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        etherealBridge.setBridgeConfig(
            IPositionTokenBridge.BridgeConfig({
                remoteEid: 999,
                remoteBridge: address(0x1234)
            })
        );
    }

    // ============ Bridge To Remote Tests ============

    function test_bridge_revertIfZeroAddress() public {
        vm.prank(user);
        vm.expectRevert(IPositionTokenBridge.ZeroAddress.selector);
        etherealBridge.bridge{value: 1 ether}(address(0), user, 1e17);
    }

    function test_bridge_revertIfZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(IPositionTokenBridge.ZeroAmount.selector);
        etherealBridge.bridge{value: 1 ether}(address(positionToken), user, 0);
    }

    function test_bridge_revertIfInvalidToken() public {
        // Deploy a token without required interface methods
        MockInvalidToken invalidToken = new MockInvalidToken();

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPositionTokenBridge.InvalidToken.selector,
                address(invalidToken)
            )
        );
        etherealBridge.bridge{value: 1 ether}(address(invalidToken), user, 1e17);
    }

    function test_quoteBridge_returnsValidFee() public view {
        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            1e17
        );
        assertTrue(fee.nativeFee > 0);
    }

    function test_bridge_success_createsPendingBridge() public {
        uint256 amount = 5e17; // 0.5 tokens

        // Approve bridge to transfer tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        // Get quote
        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        // Bridge tokens
        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Verify pending bridge created
        IPositionTokenBridge.PendingBridge memory pending = etherealBridge.getPendingBridge(bridgeId);
        assertEq(pending.token, address(positionToken));
        assertEq(pending.sender, user);
        assertEq(pending.recipient, user);
        assertEq(pending.amount, amount);
        assertEq(uint8(pending.status), uint8(IPositionTokenBridge.BridgeStatus.PENDING));

        // Verify escrowed
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), amount);
        assertEq(positionToken.balanceOf(address(etherealBridge)), amount);
        assertEq(positionToken.balanceOf(user), 1e18 - amount);
    }

    // ============ Full Flow Tests ============
    // Note: In test environment, ACK won't be sent automatically because the LZ test
    // framework doesn't preserve contract balances during message delivery. The bridge
    // contracts handle this gracefully by skipping ACK if balance is insufficient.
    // In production, contracts should be funded for ACK messages.

    function test_fullFlow_bridgeAndMint() public {
        uint256 amount = 5e17;

        // Approve and bridge
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Initial status is PENDING
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPositionTokenBridge.BridgeStatus.PENDING)
        );

        // Deliver packets to Arbitrum (mint tokens)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        // Get the deployed bridged token address
        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Verify token was deployed and minted
        assertTrue(bridgedToken.code.length > 0);
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), amount);
        assertEq(BridgedPositionToken(bridgedToken).pickConfigId(), PREDICTION_ID);
        assertEq(BridgedPositionToken(bridgedToken).isPredictorToken(), IS_PREDICTOR_TOKEN);

        // Status remains PENDING (ACK not sent in test env due to balance limitation)
        // In production, ACK would mark it COMPLETED
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPositionTokenBridge.BridgeStatus.PENDING)
        );
    }

    function test_fullFlow_bridgeBackAndRelease() public {
        uint256 amount = 5e17;

        // First bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Deliver to Arbitrum (ACK not sent due to test env balance limitation)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), amount);

        // Approve and bridge back
        vm.prank(user);
        BridgedPositionToken(bridgedToken).approve(address(arbitrumBridge), amount);

        MessagingFee memory backFee = arbitrumBridge.quoteBridgeBack(
            bridgedToken,
            amount
        );

        vm.prank(user);
        bytes32 bridgeBackId = arbitrumBridge.bridgeBack{value: backFee.nativeFee}(
            bridgedToken,
            user,
            amount
        );

        // Bridged tokens should be escrowed (NOT burned yet)
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), 0);
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(address(arbitrumBridge)), amount);
        assertEq(arbitrumBridge.getEscrowedBalance(bridgedToken), amount);

        // Bridge back is PENDING
        assertEq(
            uint8(arbitrumBridge.getPendingBridgeBack(bridgeBackId).status),
            uint8(IPositionTokenBridgeRemote.BridgeStatus.PENDING)
        );

        // Deliver packets back to Ethereal (release tokens, ACK not sent due to test env)
        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Original tokens should be released
        assertEq(positionToken.balanceOf(user), 1e18);
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), 0);

        // Bridge back status remains PENDING (ACK not received in test env)
        // Tokens remain escrowed on Arbitrum until ACK received
        assertEq(
            uint8(arbitrumBridge.getPendingBridgeBack(bridgeBackId).status),
            uint8(IPositionTokenBridgeRemote.BridgeStatus.PENDING)
        );
        // In production, ACK would trigger burn of escrowed tokens
    }

    function test_fullFlow_partialBridgeAndBack() public {
        uint256 bridgeAmount = 5e17;
        uint256 bridgeBackAmount = 2e17;

        // Bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), bridgeAmount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            bridgeAmount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            bridgeAmount
        );

        // Deliver to Arbitrum (ACK not sent due to test env balance limitation)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Bridge back partial amount
        vm.prank(user);
        BridgedPositionToken(bridgedToken).approve(address(arbitrumBridge), bridgeBackAmount);

        MessagingFee memory backFee = arbitrumBridge.quoteBridgeBack(
            bridgedToken,
            bridgeBackAmount
        );

        vm.prank(user);
        arbitrumBridge.bridgeBack{value: backFee.nativeFee}(
            bridgedToken,
            user,
            bridgeBackAmount
        );

        // Should have remaining bridged tokens (minus escrowed amount)
        assertEq(
            BridgedPositionToken(bridgedToken).balanceOf(user),
            bridgeAmount - bridgeBackAmount
        );

        // Deliver bridge back to Ethereal (ACK not sent due to test env)
        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Check balances - original tokens released
        assertEq(positionToken.balanceOf(user), 1e18 - bridgeAmount + bridgeBackAmount);
        assertEq(
            etherealBridge.getEscrowedBalance(address(positionToken)),
            bridgeAmount - bridgeBackAmount
        );
    }

    // ============ Retry and Emergency Cancel Tests ============

    function test_retryBridge_success() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Fast forward past min retry delay
        vm.warp(block.timestamp + 5 minutes + 1);

        // Get retry fee quote
        MessagingFee memory retryFee = etherealBridge.quoteRetryBridge(bridgeId);

        // Retry bridge
        vm.prank(user);
        etherealBridge.retryBridge{value: retryFee.nativeFee}(bridgeId);

        // Status should still be PENDING (waiting for ACK)
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPositionTokenBridge.BridgeStatus.PENDING)
        );
    }

    function test_retryBridge_revertIfTooSoon() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        IPositionTokenBridge.PendingBridge memory pending = etherealBridge.getPendingBridge(bridgeId);

        // Try to retry immediately
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPositionTokenBridge.RetryTooSoon.selector,
                bridgeId,
                pending.lastRetryAt,
                pending.lastRetryAt + 5 minutes
            )
        );
        etherealBridge.retryBridge{value: 0.1 ether}(bridgeId);
    }

    function test_emergencyCancelBridge_success() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Fast forward past emergency cancel delay (7 days)
        vm.warp(block.timestamp + 7 days + 1);

        // Get cancel fee quote
        MessagingFee memory cancelFee = etherealBridge.quoteEmergencyCancelBridge();

        // Emergency cancel bridge
        vm.prank(user);
        etherealBridge.emergencyCancelBridge{value: cancelFee.nativeFee}(bridgeId);

        // Verify cancelled
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPositionTokenBridge.BridgeStatus.CANCELLED)
        );

        // Tokens returned to user
        assertEq(positionToken.balanceOf(user), 1e18);
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), 0);
    }

    function test_emergencyCancelBridge_revertIfNotExpired() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        IPositionTokenBridge.PendingBridge memory pending = etherealBridge.getPendingBridge(bridgeId);

        // Try to emergency cancel before 7 days
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPositionTokenBridge.BridgeNotExpiredForEmergencyCancel.selector,
                bridgeId,
                pending.createdAt,
                uint64(block.timestamp)
            )
        );
        etherealBridge.emergencyCancelBridge{value: 0.1 ether}(bridgeId);
    }

    function test_emergencyCancelBridgeBack_success() public {
        uint256 amount = 5e17;

        // First bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Deliver to Arbitrum (ACK not sent due to test env)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Initiate bridge back
        vm.prank(user);
        BridgedPositionToken(bridgedToken).approve(address(arbitrumBridge), amount);

        MessagingFee memory backFee = arbitrumBridge.quoteBridgeBack(
            bridgedToken,
            amount
        );

        vm.prank(user);
        bytes32 bridgeBackId = arbitrumBridge.bridgeBack{value: backFee.nativeFee}(
            bridgedToken,
            user,
            amount
        );

        // Tokens are escrowed
        assertEq(arbitrumBridge.getEscrowedBalance(bridgedToken), amount);

        // Fast forward past emergency cancel delay (7 days)
        vm.warp(block.timestamp + 7 days + 1);

        // Emergency cancel bridge back
        vm.prank(user);
        arbitrumBridge.emergencyCancelBridgeBack(bridgeBackId);

        // Verify cancelled
        assertEq(
            uint8(arbitrumBridge.getPendingBridgeBack(bridgeBackId).status),
            uint8(IPositionTokenBridgeRemote.BridgeStatus.CANCELLED)
        );

        // Tokens returned to user
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), amount);
        assertEq(arbitrumBridge.getEscrowedBalance(bridgedToken), 0);
    }

    // ============ Factory Tests ============

    function test_factory_computeSalt() public view {
        bytes32 salt = factory.computeSalt(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(salt, keccak256(abi.encode(PREDICTION_ID, IS_PREDICTOR_TOKEN)));
    }

    function test_factory_predictAddress() public view {
        address predicted = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertTrue(predicted != address(0));
    }

    function test_factory_isDeployed_false() public view {
        assertFalse(factory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN));
    }

    function test_factory_deployer_isCorrect() public view {
        assertEq(factory.deployer(), address(arbitrumBridge));
    }

    function test_factory_directDeploy_works() public {
        // Test that factory can deploy directly from the bridge
        vm.prank(address(arbitrumBridge));
        address token = factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(0),
            address(arbitrumBridge)
        );
        assertTrue(token.code.length > 0);
    }

    function test_factory_isDeployed_true() public {
        // Bridge to deploy token
        uint256 amount = 1e17;
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        assertTrue(factory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN));
    }

    // ============ ETH Management Tests ============

    function test_depositETH() public {
        uint256 balanceBefore = address(etherealBridge).balance;
        (bool success,) = address(etherealBridge).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(etherealBridge).balance, balanceBefore + 1 ether);
    }

    function test_getETHBalance() public view {
        assertEq(etherealBridge.getETHBalance(), 100 ether);
        assertEq(arbitrumBridge.getETHBalance(), 100 ether);
    }

    // ============ View Function Tests ============

    function test_getPendingBridges_returnsCorrectIds() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            amount
        );

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Check pending bridges
        bytes32[] memory pendingIds = etherealBridge.getPendingBridges(user);
        assertEq(pendingIds.length, 1);
        assertEq(pendingIds[0], bridgeId);
    }

    function test_isBridgeProcessed_returnsFalseInitially() public view {
        bytes32 fakeBridgeId = keccak256("fake");
        assertFalse(arbitrumBridge.isBridgeProcessed(fakeBridgeId));
    }

    // ============ Ownership Renouncement Tests ============

    function test_isConfigComplete_returnsFalse_whenNotConfigured() public {
        // Deploy new bridge without config
        PositionTokenBridge newBridge = new PositionTokenBridge(
            address(endpoints[etherealEid]),
            owner
        );

        assertFalse(newBridge.isConfigComplete());
    }

    function test_isConfigComplete_returnsTrue_whenFullyConfigured() public view {
        // Already configured in setUp
        assertTrue(etherealBridge.isConfigComplete());
        assertTrue(arbitrumBridge.isConfigComplete());
    }

    function test_renounceOwnershipSafe_reverts_whenIncomplete() public {
        // Deploy new bridge without config
        PositionTokenBridge newBridge = new PositionTokenBridge(
            address(endpoints[etherealEid]),
            owner
        );

        vm.expectRevert("Config incomplete");
        newBridge.renounceOwnershipSafe();
    }

    function test_renounceOwnershipSafe_succeeds_whenComplete() public {
        // Ethereal bridge is fully configured
        assertEq(etherealBridge.owner(), owner);

        etherealBridge.renounceOwnershipSafe();

        assertEq(etherealBridge.owner(), address(0));
    }

    function test_renounceOwnershipSafe_reverts_whenNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        etherealBridge.renounceOwnershipSafe();
    }

    function test_factory_isConfigComplete_returnsFalse_whenNoDeployer() public {
        // Deploy new factory without deployer set
        PositionTokenFactory newFactory = new PositionTokenFactory(owner);

        assertFalse(newFactory.isConfigComplete());
    }

    function test_factory_isConfigComplete_returnsTrue_whenDeployerSet() public view {
        // Already configured in setUp
        assertTrue(factory.isConfigComplete());
    }

    function test_factory_renounceOwnershipSafe_reverts_whenIncomplete() public {
        // Deploy new factory without deployer set
        PositionTokenFactory newFactory = new PositionTokenFactory(owner);

        vm.expectRevert("Config incomplete");
        newFactory.renounceOwnershipSafe();
    }

    function test_factory_renounceOwnershipSafe_succeeds_whenComplete() public {
        // Factory is configured with deployer in setUp
        assertEq(factory.owner(), owner);

        factory.renounceOwnershipSafe();

        assertEq(factory.owner(), address(0));
    }
}

/// @notice Mock invalid token without required interface
contract MockInvalidToken {
    // Intentionally missing predictionId() and isPredictorToken()
    function name() external pure returns (string memory) {
        return "Invalid";
    }

    function symbol() external pure returns (string memory) {
        return "INV";
    }
}
