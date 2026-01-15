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
/// @notice Test suite for position token bridge
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
    event TokensBridged(
        address indexed token,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        bytes32 guid
    );
    event TokensReleased(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    event BridgeConfigUpdated(IPositionTokenBridge.BridgeConfig config);

    // Events from IPositionTokenBridgeRemote
    event TokensMinted(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        bool isNewDeployment
    );
    event TokensBridgedBack(
        address indexed token,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        bytes32 guid
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

        // Deploy Arbitrum bridge
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

        // Register token in bridge
        etherealBridge.registerToken(
            address(positionToken),
            IPositionTokenBridge.TokenMetadata({
                predictionId: PREDICTION_ID,
                isPredictorToken: IS_PREDICTOR_TOKEN,
                name: "Predictor Token",
                symbol: "PRED"
            })
        );
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(etherealBridge.owner(), owner);
        assertEq(arbitrumBridge.owner(), owner);
    }

    function test_constructor_setsFactory() public view {
        assertEq(address(arbitrumBridge.factory()), address(factory));
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

    function test_registerToken_success() public view {
        assertTrue(etherealBridge.isTokenRegistered(address(positionToken)));
        IPositionTokenBridge.TokenMetadata memory metadata = etherealBridge.getTokenMetadata(
            address(positionToken)
        );
        assertEq(metadata.predictionId, PREDICTION_ID);
        assertEq(metadata.isPredictorToken, IS_PREDICTOR_TOKEN);
    }

    function test_registerToken_revertIfNotOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        etherealBridge.registerToken(
            address(0x1234),
            IPositionTokenBridge.TokenMetadata({
                predictionId: PREDICTION_ID,
                isPredictorToken: true,
                name: "Test",
                symbol: "TEST"
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

    function test_bridge_revertIfTokenNotRegistered() public {
        MockPositionToken unregistered = new MockPositionToken(
            "Unregistered",
            "UNR",
            keccak256("other"),
            true,
            user
        );

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IPositionTokenBridge.TokenNotRegistered.selector,
                address(unregistered)
            )
        );
        etherealBridge.bridge{value: 1 ether}(address(unregistered), user, 1e17);
    }

    function test_quoteBridge_returnsValidFee() public view {
        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            user,
            1e17
        );
        assertTrue(fee.nativeFee > 0);
    }

    function test_bridge_success() public {
        uint256 amount = 5e17; // 0.5 tokens

        // Approve bridge to transfer tokens
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        // Get quote
        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            user,
            amount
        );

        // Bridge tokens
        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Verify escrowed
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), amount);
        assertEq(positionToken.balanceOf(address(etherealBridge)), amount);
        assertEq(positionToken.balanceOf(user), 1e18 - amount);
    }

    // ============ Full Flow Tests ============

    function test_fullFlow_bridgeAndMint() public {
        uint256 amount = 5e17;

        // Approve and bridge
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            user,
            amount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        // Deliver packets to Arbitrum
        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        // Get the deployed bridged token address
        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Verify token was deployed and minted
        assertTrue(bridgedToken.code.length > 0);
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), amount);
        assertEq(BridgedPositionToken(bridgedToken).predictionId(), PREDICTION_ID);
        assertEq(BridgedPositionToken(bridgedToken).isPredictorToken(), IS_PREDICTOR_TOKEN);
    }

    function test_fullFlow_bridgeBackAndRelease() public {
        uint256 amount = 5e17;

        // First bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), amount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            user,
            amount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            amount
        );

        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), amount);

        // Now bridge back
        MessagingFee memory backFee = arbitrumBridge.quoteBridgeBack(
            bridgedToken,
            user,
            amount
        );

        vm.prank(user);
        arbitrumBridge.bridgeBack{value: backFee.nativeFee}(
            bridgedToken,
            user,
            amount
        );

        // Bridged tokens should be burned
        assertEq(BridgedPositionToken(bridgedToken).balanceOf(user), 0);

        // Deliver packets back to Ethereal
        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Original tokens should be released
        assertEq(positionToken.balanceOf(user), 1e18);
        assertEq(etherealBridge.getEscrowedBalance(address(positionToken)), 0);
    }

    function test_fullFlow_partialBridgeAndBack() public {
        uint256 bridgeAmount = 5e17;
        uint256 bridgeBackAmount = 2e17;

        // Bridge to Arbitrum
        vm.prank(user);
        positionToken.approve(address(etherealBridge), bridgeAmount);

        MessagingFee memory fee = etherealBridge.quoteBridge(
            address(positionToken),
            user,
            bridgeAmount
        );

        vm.prank(user);
        etherealBridge.bridge{value: fee.nativeFee}(
            address(positionToken),
            user,
            bridgeAmount
        );

        verifyPackets(arbitrumEid, addressToBytes32(address(arbitrumBridge)));

        address bridgedToken = factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);

        // Bridge back partial amount
        MessagingFee memory backFee = arbitrumBridge.quoteBridgeBack(
            bridgedToken,
            user,
            bridgeBackAmount
        );

        vm.prank(user);
        arbitrumBridge.bridgeBack{value: backFee.nativeFee}(
            bridgedToken,
            user,
            bridgeBackAmount
        );

        // Should have remaining bridged tokens
        assertEq(
            BridgedPositionToken(bridgedToken).balanceOf(user),
            bridgeAmount - bridgeBackAmount
        );

        verifyPackets(etherealEid, addressToBytes32(address(etherealBridge)));

        // Check balances
        assertEq(positionToken.balanceOf(user), 1e18 - bridgeAmount + bridgeBackAmount);
        assertEq(
            etherealBridge.getEscrowedBalance(address(positionToken)),
            bridgeAmount - bridgeBackAmount
        );
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
            user,
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
        (bool success,) = address(etherealBridge).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(etherealBridge).balance, 1 ether);
    }

    function test_withdrawETH() public {
        (bool success,) = address(etherealBridge).call{value: 1 ether}("");
        assertTrue(success);

        uint256 ownerBalanceBefore = owner.balance;
        etherealBridge.withdrawETH(0.5 ether);
        assertEq(owner.balance, ownerBalanceBefore + 0.5 ether);
    }

    function test_withdrawETH_revertIfNotOwner() public {
        (bool success,) = address(etherealBridge).call{value: 1 ether}("");
        assertTrue(success);

        vm.prank(unauthorizedUser);
        vm.expectRevert();
        etherealBridge.withdrawETH(0.5 ether);
    }
}
