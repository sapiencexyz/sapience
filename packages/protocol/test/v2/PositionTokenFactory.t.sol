// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {
    PositionTokenFactory
} from "../../src/v2/bridge/PositionTokenFactory.sol";
import {
    BridgedPositionToken
} from "../../src/v2/bridge/BridgedPositionToken.sol";

/// @title PositionTokenFactoryTest
/// @notice Test suite for CREATE3-based position token factory
contract PositionTokenFactoryTest is Test {
    PositionTokenFactory private factory;
    address private owner;
    address private deployer;

    bytes32 public constant PREDICTION_ID = keccak256("test-prediction");
    bool public constant IS_PREDICTOR_TOKEN = true;

    function setUp() public {
        owner = address(this);
        deployer = address(0x1234);

        factory = new PositionTokenFactory(owner);
        factory.setDeployer(deployer);
    }

    function test_computeSalt() public view {
        bytes32 salt = factory.computeSalt(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertEq(salt, keccak256(abi.encode(PREDICTION_ID, IS_PREDICTOR_TOKEN)));
    }

    function test_predictAddress() public view {
        address predicted =
            factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN);
        assertTrue(predicted != address(0));
    }

    function test_isDeployed_false() public view {
        assertFalse(factory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN));
    }

    function test_deploy_byOwner() public {
        address token = factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(0),
            address(this)
        );

        // Verify deployment
        assertTrue(token.code.length > 0);
        assertTrue(factory.isDeployed(PREDICTION_ID, IS_PREDICTOR_TOKEN));
        assertEq(
            token, factory.predictAddress(PREDICTION_ID, IS_PREDICTOR_TOKEN)
        );
    }

    function test_deploy_byDeployer() public {
        vm.prank(deployer);
        address token = factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(0),
            address(this)
        );

        assertTrue(token.code.length > 0);
    }

    function test_deploy_revertIfUnauthorized() public {
        vm.prank(address(0x9999));
        vm.expectRevert();
        factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(0),
            address(this)
        );
    }

    function test_deploy_tokenProperties() public {
        address token = factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "My Token",
            "MTK",
            address(0),
            address(this)
        );

        BridgedPositionToken bridged = BridgedPositionToken(token);
        assertEq(bridged.name(), "My Token");
        assertEq(bridged.symbol(), "MTK");
        assertEq(bridged.pickConfigId(), PREDICTION_ID);
        assertEq(bridged.isPredictorToken(), IS_PREDICTOR_TOKEN);
        assertEq(bridged.bridge(), address(this));
        // Factory address from token's perspective is the CREATE3 proxy, not the factory contract
        // Just verify factory is non-zero
        assertTrue(bridged.factory() != address(0));
    }

    function test_deploy_revertIfAlreadyDeployed() public {
        factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(0),
            address(this)
        );

        vm.expectRevert();
        factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token 2",
            "TEST2",
            address(0),
            address(this)
        );
    }
}
