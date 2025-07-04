// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridge} from "../../src/bridge/MarketLayerZeroBridge.sol";
import {UMALayerZeroBridge} from "../../src/bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {IETHManagement, IFeeManagement} from "../../src/bridge/interfaces/ILayerZeroBridge.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {MockOptimisticOracleV3} from "./mocks/mockOptimisticOracleV3.sol";
import {MockMarketGroup} from "./mocks/mockMarketGroup.sol";
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTestEthBalance is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private umaUser = address(0x1);
    address private marketUser = address(0x2);
    address private owner = address(0x3);
    address private refundAddress = address(0x4);
    address private marketGroup = address(0x5);

    // Bridges
    MarketLayerZeroBridge private marketBridge;
    UMALayerZeroBridge private umaBridge;

    // Other contracts
    IMintableToken private bondCurrency;
    // address private optimisticOracleV3;
    MockOptimisticOracleV3 private mockOptimisticOracleV3;
    MockMarketGroup private mockMarketGroup;

    // LZ data
    uint32 private umaEiD = 1;
    uint32 private marketEiD = 2;

    address umaEndpoint;
    address marketEndpoint;

    uint256 private BOND_AMOUNT = 1_000 ether;

    bytes32 private umaAssertionId;
    bytes32 private marketAssertionId;

    function setUp() public override {
        vm.deal(umaUser, 1000 ether);
        vm.deal(marketUser, 1000 ether);
        vm.deal(owner, 1000 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        marketBridge = MarketLayerZeroBridge(
            payable(
                _deployOApp(
                    type(MarketLayerZeroBridge).creationCode, abi.encode(address(endpoints[marketEiD]), address(this))
                )
            )
        );

        umaBridge = UMALayerZeroBridge(
            payable(
                _deployOApp(
                    type(UMALayerZeroBridge).creationCode, abi.encode(address(endpoints[umaEiD]), address(this))
                )
            )
        );

        address[] memory oapps = new address[](2);
        oapps[0] = address(marketBridge);
        oapps[1] = address(umaBridge);
        this.wireOApps(oapps);

        umaEndpoint = address(umaBridge.endpoint());
        marketEndpoint = address(marketBridge.endpoint());

        vm.deal(address(umaBridge), 100 ether);
        vm.deal(address(marketBridge), 100 ether);

        mockOptimisticOracleV3 = new MockOptimisticOracleV3(address(umaBridge));
        mockMarketGroup = new MockMarketGroup(address(marketBridge));

        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));

        umaBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: marketEiD, remoteBridge: address(marketBridge)}));

        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: umaEiD, remoteBridge: address(umaBridge)}));

        // Link bridges to the external contracts
        umaBridge.setOptimisticOracleV3(address(mockOptimisticOracleV3));
        marketBridge.enableMarketGroup(address(mockMarketGroup));

        marketBridge.setLzReceiveCost(1000000);
        umaBridge.setLzReceiveCost(1000000);

        marketBridge.setGasThresholds(0.01 ether, 0.005 ether);
        umaBridge.setGasThresholds(0.1 ether, 0.05 ether);

        // Deposit bond to the escrow
        uint256 depositAmount = 100 * BOND_AMOUNT;
        bondCurrency.mint(depositAmount, umaUser);
        vm.startPrank(umaUser);
        bondCurrency.approve(address(umaBridge), depositAmount);
        umaBridge.depositBond(address(bondCurrency), depositAmount);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Create a claim
        mockMarketGroup.setAssertThruthData("some claim message", 3600, address(bondCurrency), BOND_AMOUNT);
        marketAssertionId = mockMarketGroup.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({marketId: 1, asserter: address(umaUser), settlementSqrtPriceX96: 1})
        );

        verifyPackets(umaEiD, addressToBytes32(address(umaBridge)));
        umaAssertionId = mockOptimisticOracleV3.getLastAssertionId();

        // Set owner as the owner of both bridges
        marketBridge.transferOwnership(owner);
        umaBridge.transferOwnership(owner);
    }

    // ============ ETH Management Tests ============

    // MarketLayerZeroBridge ETH Tests
    function test_MarketBridge_depositETH() public {
        uint256 initialBalance = address(marketBridge).balance;
        uint256 depositAmount = 10 ether;

        vm.deal(marketUser, depositAmount);
        vm.startPrank(marketUser);

        marketBridge.depositETH{value: depositAmount}();

        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBalance + depositAmount);
    }

    function test_MarketBridge_depositETH_emitsEvent() public {
        uint256 depositAmount = 5 ether;
        vm.deal(marketUser, depositAmount);

        vm.startPrank(marketUser);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHDeposited(marketUser, depositAmount);
        marketBridge.depositETH{value: depositAmount}();
        vm.stopPrank();
    }

    function test_MarketBridge_withdrawETH() public {
        uint256 withdrawAmount = 20 ether;
        uint256 initialOwnerBalance = owner.balance;
        uint256 initialBridgeBalance = address(marketBridge).balance;

        vm.startPrank(owner);
        marketBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBridgeBalance - withdrawAmount);
        assertEq(owner.balance, initialOwnerBalance + withdrawAmount);
    }

    function test_MarketBridge_withdrawETH_emitsEvent() public {
        uint256 withdrawAmount = 15 ether;

        vm.startPrank(owner);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHWithdrawn(owner, withdrawAmount);
        marketBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();
    }

    function test_MarketBridge_withdrawETH_revertsInsufficientBalance() public {
        uint256 excessiveAmount = address(marketBridge).balance + 1 ether;

        vm.startPrank(owner);
        vm.expectRevert("Insufficient balance");
        marketBridge.withdrawETH(excessiveAmount);
        vm.stopPrank();
    }

    function test_MarketBridge_withdrawETH_revertsNonOwner() public {
        uint256 withdrawAmount = 10 ether;

        vm.startPrank(marketUser);
        vm.expectRevert();
        marketBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();
    }

    function test_MarketBridge_getETHBalance() public view {
        uint256 expectedBalance = address(marketBridge).balance;
        uint256 actualBalance = marketBridge.getETHBalance();

        assertEq(actualBalance, expectedBalance);
    }

    function test_MarketBridge_receive() public {
        uint256 initialBalance = address(marketBridge).balance;
        uint256 sendAmount = 7 ether;

        vm.deal(marketUser, sendAmount);
        vm.startPrank(marketUser);

        (bool success,) = address(marketBridge).call{value: sendAmount}("");
        assertTrue(success);

        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBalance + sendAmount);
    }

    function test_MarketBridge_receive_emitsEvent() public {
        uint256 sendAmount = 3 ether;
        vm.deal(marketUser, sendAmount);

        vm.startPrank(marketUser);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHDeposited(marketUser, sendAmount);
        (bool success,) = address(marketBridge).call{value: sendAmount}("");
        assertTrue(success);
        vm.stopPrank();
    }

    // UMALayerZeroBridge ETH Tests
    function test_UMABridge_depositETH() public {
        uint256 initialBalance = address(umaBridge).balance;
        uint256 depositAmount = 12 ether;

        vm.deal(umaUser, depositAmount);
        vm.startPrank(umaUser);

        umaBridge.depositETH{value: depositAmount}();

        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBalance + depositAmount);
    }

    function test_UMABridge_depositETH_emitsEvent() public {
        uint256 depositAmount = 8 ether;
        vm.deal(umaUser, depositAmount);

        vm.startPrank(umaUser);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHDeposited(umaUser, depositAmount);
        umaBridge.depositETH{value: depositAmount}();
        vm.stopPrank();
    }

    function test_UMABridge_withdrawETH() public {
        uint256 withdrawAmount = 25 ether;
        uint256 initialOwnerBalance = owner.balance;
        uint256 initialBridgeBalance = address(umaBridge).balance;

        vm.startPrank(owner);
        umaBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBridgeBalance - withdrawAmount);
        assertEq(owner.balance, initialOwnerBalance + withdrawAmount);
    }

    function test_UMABridge_withdrawETH_emitsEvent() public {
        uint256 withdrawAmount = 18 ether;

        vm.startPrank(owner);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHWithdrawn(owner, withdrawAmount);
        umaBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();
    }

    function test_UMABridge_withdrawETH_revertsInsufficientBalance() public {
        uint256 excessiveAmount = address(umaBridge).balance + 1 ether;

        vm.startPrank(owner);
        vm.expectRevert("Insufficient balance");
        umaBridge.withdrawETH(excessiveAmount);
        vm.stopPrank();
    }

    function test_UMABridge_withdrawETH_revertsNonOwner() public {
        uint256 withdrawAmount = 10 ether;

        vm.startPrank(umaUser);
        vm.expectRevert();
        umaBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();
    }

    function test_UMABridge_getETHBalance() public view {
        uint256 expectedBalance = address(umaBridge).balance;
        uint256 actualBalance = umaBridge.getETHBalance();

        assertEq(actualBalance, expectedBalance);
    }

    function test_UMABridge_receive() public {
        uint256 initialBalance = address(umaBridge).balance;
        uint256 sendAmount = 9 ether;

        vm.deal(umaUser, sendAmount);
        vm.startPrank(marketUser);

        (bool success,) = address(umaBridge).call{value: sendAmount}("");
        assertTrue(success);

        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBalance + sendAmount);
    }

    function test_UMABridge_receive_emitsEvent() public {
        uint256 sendAmount = 4 ether;
        vm.deal(umaUser, sendAmount);

        vm.startPrank(umaUser);
        vm.expectEmit(true, true, false, true);
        emit IETHManagement.ETHDeposited(umaUser, sendAmount);
        (bool success,) = address(umaBridge).call{value: sendAmount}("");
        assertTrue(success);
        vm.stopPrank();
    }

    // Gas Threshold Tests
    function test_MarketBridge_gasThresholdWarnings() public {
        // First withdraw to get below warning threshold
        uint256 withdrawAmount = address(marketBridge).balance - 0.005 ether; // Just above critical
        vm.startPrank(owner);
        marketBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();

        // Now withdraw a bit more to trigger critical
        vm.startPrank(owner);
        marketBridge.withdrawETH(0.003 ether);
        vm.stopPrank();

        // Should be below critical threshold now
        (, uint256 criticalGasThreshold) = marketBridge.getGasThresholds();
        assertTrue(address(marketBridge).balance <= criticalGasThreshold);
    }

    function test_UMABridge_gasThresholdWarnings() public {
        // First withdraw to get below warning threshold
        uint256 withdrawAmount = address(umaBridge).balance - 0.04 ether; // Just above critical
        vm.startPrank(owner);
        umaBridge.withdrawETH(withdrawAmount);
        vm.stopPrank();

        // Now withdraw a bit more to trigger critical
        vm.startPrank(owner);
        umaBridge.withdrawETH(0.02 ether);
        vm.stopPrank();

        // Should be below critical threshold now
        (, uint256 criticalGasThreshold) = umaBridge.getGasThresholds();
        assertTrue(address(umaBridge).balance <= criticalGasThreshold);
    }

    // Multiple deposits and withdrawals
    function test_MarketBridge_multipleDepositsAndWithdrawals() public {
        uint256 initialBalance = address(marketBridge).balance;

        // Multiple deposits
        vm.deal(marketUser, 50 ether);
        vm.startPrank(marketUser);
        marketBridge.depositETH{value: 10 ether}();
        marketBridge.depositETH{value: 15 ether}();
        marketBridge.depositETH{value: 25 ether}();
        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBalance + 50 ether);

        // Multiple withdrawals
        vm.startPrank(owner);
        marketBridge.withdrawETH(20 ether);
        marketBridge.withdrawETH(15 ether);
        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBalance + 15 ether);
    }

    function test_UMABridge_multipleDepositsAndWithdrawals() public {
        uint256 initialBalance = address(umaBridge).balance;

        // Multiple deposits
        vm.deal(umaUser, 60 ether);
        vm.startPrank(umaUser);
        umaBridge.depositETH{value: 20 ether}();
        umaBridge.depositETH{value: 25 ether}();
        umaBridge.depositETH{value: 15 ether}();
        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBalance + 60 ether);

        // Multiple withdrawals
        vm.startPrank(owner);
        umaBridge.withdrawETH(30 ether);
        umaBridge.withdrawETH(20 ether);
        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBalance + 10 ether);
    }

    // Zero value tests
    function test_MarketBridge_depositETH_zeroValue() public {
        uint256 initialBalance = address(marketBridge).balance;

        marketBridge.depositETH{value: 0}();

        assertEq(address(marketBridge).balance, initialBalance);
    }

    function test_UMABridge_depositETH_zeroValue() public {
        uint256 initialBalance = address(umaBridge).balance;

        umaBridge.depositETH{value: 0}();

        assertEq(address(umaBridge).balance, initialBalance);
    }

    function test_MarketBridge_withdrawETH_zeroValue() public {
        uint256 initialBalance = address(marketBridge).balance;

        vm.startPrank(owner);
        marketBridge.withdrawETH(0);
        vm.stopPrank();

        assertEq(address(marketBridge).balance, initialBalance);
    }

    function test_UMABridge_withdrawETH_zeroValue() public {
        uint256 initialBalance = address(umaBridge).balance;

        vm.startPrank(owner);
        umaBridge.withdrawETH(0);
        vm.stopPrank();

        assertEq(address(umaBridge).balance, initialBalance);
    }
}
