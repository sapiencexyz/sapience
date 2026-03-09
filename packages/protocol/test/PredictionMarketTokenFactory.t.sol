// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import {
    PredictionMarketTokenFactory
} from "../src/PredictionMarketTokenFactory.sol";
import { PredictionMarketToken } from "../src/PredictionMarketToken.sol";

/// @title PredictionMarketTokenFactoryTest
/// @notice Test suite for CREATE3-based position token factory
contract PredictionMarketTokenFactoryTest is Test {
    PredictionMarketTokenFactory private factory;
    address private owner;
    address private deployer;

    bytes32 public constant PREDICTION_ID = keccak256("test-prediction");
    bool public constant IS_PREDICTOR_TOKEN = true;

    function setUp() public {
        owner = address(this);
        deployer = address(0x1234);

        factory = new PredictionMarketTokenFactory(owner);
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
            address(this)
        );
    }

    function test_deploy_tokenProperties() public {
        address token = factory.deploy(
            PREDICTION_ID, IS_PREDICTOR_TOKEN, "My Token", "MTK", address(this)
        );

        PredictionMarketToken pmToken = PredictionMarketToken(token);
        assertEq(pmToken.name(), "My Token");
        assertEq(pmToken.symbol(), "MTK");
        assertEq(pmToken.pickConfigId(), PREDICTION_ID);
        assertEq(pmToken.isPredictorToken(), IS_PREDICTOR_TOKEN);
        assertEq(pmToken.authority(), address(this));
    }

    function test_deploy_revertIfAlreadyDeployed() public {
        factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token",
            "TEST",
            address(this)
        );

        vm.expectRevert();
        factory.deploy(
            PREDICTION_ID,
            IS_PREDICTOR_TOKEN,
            "Test Token 2",
            "TEST2",
            address(this)
        );
    }

    function test_isConfigComplete() public view {
        assertTrue(factory.isConfigComplete());
    }

    function test_isConfigComplete_false() public {
        PredictionMarketTokenFactory emptyFactory =
            new PredictionMarketTokenFactory(owner);
        assertFalse(emptyFactory.isConfigComplete());
    }
}
