// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {
    TestHelperOz5
} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {
    PredictionMarketBridge
} from "../src/bridge/PredictionMarketBridge.sol";
import {
    PredictionMarketBridgeRemote
} from "../src/bridge/PredictionMarketBridgeRemote.sol";
import {
    PredictionMarketTokenFactory
} from "../src/PredictionMarketTokenFactory.sol";
import { PredictionMarketToken } from "../src/PredictionMarketToken.sol";
import {
    IPredictionMarketBridge
} from "../src/bridge/interfaces/IPredictionMarketBridge.sol";
import {
    IPredictionMarketBridgeRemote
} from "../src/bridge/interfaces/IPredictionMarketBridgeRemote.sol";
import {
    IPredictionMarketBridgeBase
} from "../src/bridge/interfaces/IPredictionMarketBridgeBase.sol";
import {
    IPredictionMarketToken
} from "../src/interfaces/IPredictionMarketToken.sol";
import { MessagingFee } from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import "forge-std/Test.sol";

/// @title PredictionMarketBridgeTest
/// @notice Test suite for position token bridge with ACK mechanism
contract PredictionMarketBridgeTest is TestHelperOz5 {
    // Users
    address private owner;
    address private user;
    address private unauthorizedUser;

    // Contracts
    PredictionMarketBridge private etherealBridge;
    PredictionMarketBridgeRemote private arbitrumBridge;
    PredictionMarketTokenFactory private etherealFactory;
    PredictionMarketTokenFactory private arbitrumFactory;
    PredictionMarketToken private positionToken;

    // LZ data
    uint32 private etherealEid = 1;
    uint32 private arbitrumEid = 2;

    // Test data
    bytes32 public constant PREDICTION_ID = keccak256("test-prediction");
    bool public constant IS_PREDICTOR_TOKEN = true;

    // Events from IPredictionMarketBridgeBase
    event BridgeInitiated(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed sender,
        address recipient,
        uint256 amount,
        uint64 createdAt,
        bytes32 refCode
    );
    event BridgeRetried(bytes32 indexed bridgeId, bytes32 refCode);
    event BridgeCompleted(bytes32 indexed bridgeId);
    event BridgeCancelled(
        bytes32 indexed bridgeId, address indexed sender, uint256 amount
    );
    event BridgeConfigUpdated(IPredictionMarketBridgeBase.BridgeConfig config);

    // Events from IPredictionMarketBridge
    event TokensReleased(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount
    );

    // Events from IPredictionMarketBridgeRemote
    event TokensMinted(
        bytes32 indexed bridgeId,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isNewDeployment
    );

    function setUp() public override {
        owner = address(this);
        user = vm.addr(1);
        unauthorizedUser = vm.addr(999);

        vm.deal(owner, 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(unauthorizedUser, 100 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        // Deploy factories on both sides
        etherealFactory = new PredictionMarketTokenFactory(owner);
        arbitrumFactory = new PredictionMarketTokenFactory(owner);

        // Deploy Ethereal bridge with factory
        etherealBridge = PredictionMarketBridge(
            payable(_deployOApp(
                    type(PredictionMarketBridge).creationCode,
                    abi.encode(
                        address(endpoints[etherealEid]),
                        owner,
                        address(etherealFactory)
                    )
                ))
        );

        // Deploy Arbitrum bridge with factory
        arbitrumBridge = PredictionMarketBridgeRemote(
            payable(_deployOApp(
                    type(PredictionMarketBridgeRemote).creationCode,
                    abi.encode(
                        address(endpoints[arbitrumEid]),
                        owner,
                        address(arbitrumFactory)
                    )
                ))
        );

        // Fund bridges for ACK fees using vm.deal for reliable test funding
        vm.deal(address(etherealBridge), 100 ether);
        vm.deal(address(arbitrumBridge), 100 ether);

        // Wire OApps
        address[] memory oapps = new address[](2);
        oapps[0] = address(etherealBridge);
        oapps[1] = address(arbitrumBridge);
        this.wireOApps(oapps);

        // Configure bridges with ACK fee estimate (0.0001 ETH)
        etherealBridge.setBridgeConfig(
            IPredictionMarketBridgeBase.BridgeConfig({
                remoteEid: arbitrumEid,
                remoteBridge: address(arbitrumBridge),
                ackFeeEstimate: 0.0001 ether
            })
        );
        arbitrumBridge.setBridgeConfig(
            IPredictionMarketBridgeBase.BridgeConfig({
                remoteEid: etherealEid,
                remoteBridge: address(etherealBridge),
                ackFeeEstimate: 0.0001 ether
            })
        );

        // Set factory deployers
        etherealFactory.setDeployer(address(this)); // test contract acts as Escrow
        arbitrumFactory.setDeployer(address(arbitrumBridge));

        // Deploy position token via Ethereal factory (simulating Escrow deployment)
        address tokenAddr = etherealFactory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Predictor Token",
            "PRED",
            address(this) // test contract is authority (can mint/burn)
        );
        positionToken = PredictionMarketToken(tokenAddr);

        // Mint tokens to user (as authority)
        positionToken.mint(user, 1e18);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(etherealBridge.owner(), owner);
        assertEq(arbitrumBridge.owner(), owner);
    }

    function test_constructor_setsFactory() public view {
        assertEq(arbitrumBridge.getFactory(), address(arbitrumFactory));
    }

    function test_constructor_setsDelayConstants() public view {
        assertEq(etherealBridge.getMinRetryDelay(), 1 hours);
        assertEq(arbitrumBridge.getMinRetryDelay(), 1 hours);
    }

    // ============ Configuration Tests ============

    function test_setBridgeConfig_success() public {
        IPredictionMarketBridgeBase.BridgeConfig memory newConfig =
            IPredictionMarketBridgeBase.BridgeConfig({
                remoteEid: 999,
                remoteBridge: address(0x1234),
                ackFeeEstimate: 0.0002 ether
            });

        vm.expectEmit(false, false, false, true);
        emit BridgeConfigUpdated(newConfig);
        etherealBridge.setBridgeConfig(newConfig);

        IPredictionMarketBridgeBase.BridgeConfig memory retrieved =
            etherealBridge.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999);
        assertEq(retrieved.remoteBridge, address(0x1234));
        assertEq(retrieved.ackFeeEstimate, 0.0002 ether);
    }

    function test_setBridgeConfig_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        etherealBridge.setBridgeConfig(
            IPredictionMarketBridgeBase.BridgeConfig({
                remoteEid: 999,
                remoteBridge: address(0x1234),
                ackFeeEstimate: 0.0001 ether
            })
        );
    }

    // ============ Bridge To Remote Tests ============

    function test_bridge_revertIfZeroAddress() public {
        vm.prank(user);
        vm.expectRevert(IPredictionMarketBridgeBase.ZeroAddress.selector);
        etherealBridge.bridge{ value: 1 ether }(
            address(0), user, 1e17, bytes32(0)
        );
    }

    function test_bridge_revertIfZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(IPredictionMarketBridgeBase.ZeroAmount.selector);
        etherealBridge.bridge{ value: 1 ether }(
            address(positionToken), user, 0, bytes32(0)
        );
    }

    function test_bridge_revertIfInvalidToken() public {
        // Deploy a token without required interface methods
        MockInvalidToken invalidToken = new MockInvalidToken();

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketBridge.InvalidToken.selector,
                address(invalidToken)
            )
        );
        etherealBridge.bridge{ value: 1 ether }(
            address(invalidToken), user, 1e17, bytes32(0)
        );
    }

    function test_bridge_revertIfFakeToken_C4() public {
        // C-4: An attacker deploys a fake token with matching pickConfigId/isPredictorToken
        // but at a different address than the factory would deploy.
        // The bridge should reject it because its address doesn't match factory.predictAddress()
        MockFakeToken fakeToken =
            new MockFakeToken(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        fakeToken.mint(user, 1e18);

        vm.prank(user);
        fakeToken.approve(address(etherealBridge), 1e18);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketBridge.InvalidToken.selector,
                address(fakeToken)
            )
        );
        etherealBridge.bridge{ value: 1 ether }(
            address(fakeToken), user, 1e17, bytes32(0)
        );
    }

    function test_quoteBridge_returnsValidFee() public view {
        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), 1e17);
        assertTrue(fee.nativeFee > 0);
    }

    function test_bridge_success_createsPendingBridge() public {
        uint256 amount = 5e17; // 0.5 tokens

        // Approve bridge to transfer tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        // Get quote
        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        // Bridge tokens
        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Verify pending bridge created
        IPredictionMarketBridgeBase.PendingBridge memory pending =
            etherealBridge.getPendingBridge(bridgeId);
        assertEq(pending.token, address(positionToken));
        assertEq(pending.sender, user);
        assertEq(pending.recipient, user);
        assertEq(pending.amount, amount);
        assertEq(
            uint8(pending.status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );

        // Verify escrowed
        assertEq(
            etherealBridge.getEscrowedBalance(address(positionToken)), amount
        );
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

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Initial status is PENDING
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );

        // Deliver packets to Arbitrum (mint tokens)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        // Get the deployed bridged token address
        address bridgedToken =
            arbitrumFactory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Verify token was deployed and minted
        assertTrue(bridgedToken.code.length > 0);
        assertEq(PredictionMarketToken(bridgedToken).balanceOf(user), amount);
        assertEq(
            PredictionMarketToken(bridgedToken).pickConfigId(), PREDICTION_ID
        );
        assertEq(
            PredictionMarketToken(bridgedToken).isPredictorToken(),
            IS_PREDICTOR_TOKEN
        );

        // Status remains PENDING (ACK not sent in test env due to balance limitation)
        // In production, ACK would mark it COMPLETED
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );
    }

    function test_fullFlow_bridgeBackAndRelease() public {
        uint256 amount = 5e17;

        // First bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Deliver to Arbitrum (ACK not sent due to test env balance limitation)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken =
            arbitrumFactory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(PredictionMarketToken(bridgedToken).balanceOf(user), amount);

        // Approve and bridge back
        vm.prank(user);
        PredictionMarketToken(bridgedToken)
            .approve(address(arbitrumBridge), amount);

        MessagingFee memory backFee =
            arbitrumBridge.quoteBridge(bridgedToken, amount);

        vm.prank(user);
        bytes32 bridgeBackId = arbitrumBridge.bridge{
            value: backFee.nativeFee
        }(
            bridgedToken, user, amount, bytes32(0)
        );

        // Bridged tokens should be escrowed (NOT burned yet)
        assertEq(PredictionMarketToken(bridgedToken).balanceOf(user), 0);
        assertEq(
            PredictionMarketToken(bridgedToken)
                .balanceOf(address(arbitrumBridge)),
            amount
        );
        assertEq(arbitrumBridge.getEscrowedBalance(bridgedToken), amount);

        // Bridge back is PENDING
        assertEq(
            uint8(arbitrumBridge.getPendingBridge(bridgeBackId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );

        // Deliver packets back to Ethereal (release tokens, ACK not sent due to test env)
        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Original tokens should be released
        assertEq(positionToken.balanceOf(user), 1e18);
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), 0);

        // Bridge back status remains PENDING (ACK not received in test env)
        // Tokens remain escrowed on Arbitrum until ACK received
        assertEq(
            uint8(arbitrumBridge.getPendingBridge(bridgeBackId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );
        // In production, ACK would trigger burn of escrowed tokens
    }

    function test_fullFlow_partialBridgeAndBack() public {
        uint256 bridgeAmount = 5e17;
        uint256 bridgeBackAmount = 2e17;

        // Bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), bridgeAmount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), bridgeAmount);

        vm.prank(user);
        etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, bridgeAmount, bytes32(0)
        );

        // Deliver to Arbitrum (ACK not sent due to test env balance limitation)
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken =
            arbitrumFactory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Bridge back partial amount
        vm.prank(user);
        PredictionMarketToken(bridgedToken)
            .approve(address(arbitrumBridge), bridgeBackAmount);

        MessagingFee memory backFee =
            arbitrumBridge.quoteBridge(bridgedToken, bridgeBackAmount);

        vm.prank(user);
        arbitrumBridge.bridge{ value: backFee.nativeFee }(
            bridgedToken, user, bridgeBackAmount, bytes32(0)
        );

        // Should have remaining bridged tokens (minus escrowed amount)
        assertEq(
            PredictionMarketToken(bridgedToken).balanceOf(user),
            bridgeAmount - bridgeBackAmount
        );

        // Deliver bridge back to Ethereal (ACK not sent due to test env)
        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Check balances - original tokens released
        assertEq(
            positionToken.balanceOf(user),
            1e18 - bridgeAmount + bridgeBackAmount
        );
        assertEq(
            etherealBridge.getEscrowedBalance(address(positionToken)),
            bridgeAmount - bridgeBackAmount
        );
    }

    // ============ Retry and Emergency Cancel Tests ============

    function test_retry_success() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Fast forward past min retry delay
        vm.warp(block.timestamp + 1 hours + 1);

        // Get retry fee quote
        MessagingFee memory retryFee = etherealBridge.quoteRetry(bridgeId);

        // Retry bridge
        vm.prank(user);
        etherealBridge.retry{ value: retryFee.nativeFee }(bridgeId, bytes32(0));

        // Status should still be PENDING (waiting for ACK)
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );
    }

    function test_retry_permissionless() public {
        uint256 amount = 5e17;

        // Bridge tokens as user
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Fast forward past min retry delay
        vm.warp(block.timestamp + 1 hours + 1);

        // Get retry fee quote
        MessagingFee memory retryFee = etherealBridge.quoteRetry(bridgeId);

        // Anyone can retry (using unauthorizedUser)
        vm.prank(unauthorizedUser);
        etherealBridge.retry{ value: retryFee.nativeFee }(bridgeId, bytes32(0));

        // Status should still be PENDING
        assertEq(
            uint8(etherealBridge.getPendingBridge(bridgeId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );
    }

    function test_retry_revertIfTooSoon() public {
        uint256 amount = 5e17;

        // Bridge tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        IPredictionMarketBridgeBase.PendingBridge memory pending =
            etherealBridge.getPendingBridge(bridgeId);

        // Try to retry immediately
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPredictionMarketBridgeBase.RetryTooSoon.selector,
                bridgeId,
                pending.lastRetryAt,
                pending.lastRetryAt + 1 hours
            )
        );
        etherealBridge.retry{ value: 0.1 ether }(bridgeId, bytes32(0));
    }

    function test_retryRemote_permissionless() public {
        uint256 amount = 5e17;

        // First bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Deliver to Arbitrum
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken =
            arbitrumFactory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Initiate bridge back
        vm.prank(user);
        PredictionMarketToken(bridgedToken)
            .approve(address(arbitrumBridge), amount);

        MessagingFee memory backFee =
            arbitrumBridge.quoteBridge(bridgedToken, amount);

        vm.prank(user);
        bytes32 bridgeBackId = arbitrumBridge.bridge{
            value: backFee.nativeFee
        }(
            bridgedToken, user, amount, bytes32(0)
        );

        // Fast forward past min retry delay
        vm.warp(block.timestamp + 1 hours + 1);

        // Get retry fee quote
        MessagingFee memory retryFee = arbitrumBridge.quoteRetry(bridgeBackId);

        // Anyone can retry (using unauthorizedUser)
        vm.prank(unauthorizedUser);
        arbitrumBridge.retry{ value: retryFee.nativeFee }(
            bridgeBackId, bytes32(0)
        );

        // Status should still be PENDING
        assertEq(
            uint8(arbitrumBridge.getPendingBridge(bridgeBackId).status),
            uint8(IPredictionMarketBridgeBase.BridgeStatus.PENDING)
        );
    }

    // ============ Factory Tests ============

    function test_factory_computeSalt() public view {
        bytes32 salt =
            arbitrumFactory.computeSalt(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(salt, keccak256(abi.encode(PREDICTION_ID, IS_PREDICTOR_TOKEN)));
    }

    function test_factory_predictAddress() public view {
        address predicted =
            arbitrumFactory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertTrue(predicted != address(0));
    }

    function test_factory_isDeployed_false() public view {
        assertFalse(
            arbitrumFactory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN)
        );
    }

    function test_factory_deployer_isCorrect() public view {
        assertEq(arbitrumFactory.deployer(), address(arbitrumBridge));
    }

    function test_factory_directDeploy_works() public {
        // Test that factory can deploy directly from the bridge
        vm.prank(address(arbitrumBridge));
        address token = arbitrumFactory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(arbitrumBridge)
        );
        assertTrue(token.code.length > 0);
    }

    function test_factory_isDeployed_true() public {
        // Bridge to deploy token
        uint256 amount = 1e17;
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        assertTrue(
            arbitrumFactory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN)
        );
    }

    // ============ ETH Management Tests ============

    function test_depositETH() public {
        uint256 balanceBefore = address(etherealBridge).balance;
        (bool success,) = address(etherealBridge).call{ value: 1 ether }("");
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

        MessagingFee memory fee =
            etherealBridge.quoteBridge(address(positionToken), amount);

        vm.prank(user);
        bytes32 bridgeId = etherealBridge.bridge{ value: fee.nativeFee }(
            address(positionToken), user, amount, bytes32(0)
        );

        // Check pending bridges
        bytes32[] memory pendingIds = etherealBridge.getPendingBridges(user);
        assertEq(pendingIds.length, 1);
        assertEq(pendingIds[0], bridgeId);
    }

    function test_isBridgeProcessed_returnsFalseInitially() public view {
        bytes32 fakeBridgeId = keccak256("fake");
        assertFalse(arbitrumBridge.isBridgeProcessed(fakeBridgeId));
        assertFalse(etherealBridge.isBridgeProcessed(fakeBridgeId));
    }

    // ============ Ownership Renouncement Tests ============

    function test_isConfigComplete_returnsFalse_whenNotConfigured() public {
        // Deploy new bridge without config
        PredictionMarketBridge newBridge = new PredictionMarketBridge(
            address(endpoints[etherealEid]), owner, address(etherealFactory)
        );

        assertFalse(newBridge.isConfigComplete());
    }

    function test_isConfigComplete_returnsTrue_whenFullyConfigured()
        public
        view
    {
        // Already configured in setUp
        assertTrue(etherealBridge.isConfigComplete());
        assertTrue(arbitrumBridge.isConfigComplete());
    }

    function test_renounceOwnershipSafe_reverts_whenIncomplete() public {
        // Deploy new bridge without config
        PredictionMarketBridge newBridge = new PredictionMarketBridge(
            address(endpoints[etherealEid]), owner, address(etherealFactory)
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

    function test_factory_isConfigComplete_returnsFalse_whenNoDeployer()
        public
    {
        // Deploy new factory without deployer set
        PredictionMarketTokenFactory newFactory =
            new PredictionMarketTokenFactory(owner);

        assertFalse(newFactory.isConfigComplete());
    }

    function test_factory_isConfigComplete_returnsTrue_whenDeployerSet()
        public
        view
    {
        // Already configured in setUp
        assertTrue(arbitrumFactory.isConfigComplete());
    }

    function test_factory_renounceOwnershipSafe_reverts_whenIncomplete()
        public
    {
        // Deploy new factory without deployer set
        PredictionMarketTokenFactory newFactory =
            new PredictionMarketTokenFactory(owner);

        vm.expectRevert("Config incomplete");
        newFactory.renounceOwnershipSafe();
    }

    function test_factory_renounceOwnershipSafe_succeeds_whenComplete() public {
        // Factory is configured with deployer in setUp
        assertEq(arbitrumFactory.owner(), owner);

        arbitrumFactory.renounceOwnershipSafe();

        assertEq(arbitrumFactory.owner(), address(0));
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

/// @notice C-4: Mock fake token that implements pickConfigId/isPredictorToken
/// but was NOT deployed by the factory
contract MockFakeToken is ERC20 {
    bytes32 public immutable pickConfigId;
    bool public immutable isPredictorToken;

    constructor(bytes32 pickConfigId_, bool isPredictorToken_)
        ERC20("Fake Token", "FAKE")
    {
        pickConfigId = pickConfigId_;
        isPredictorToken = isPredictorToken_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
