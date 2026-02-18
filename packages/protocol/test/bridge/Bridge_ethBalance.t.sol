// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {TestETHManagement} from "./mocks/TestETHManagement.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {IETHManagement} from "../../src/bridge/interfaces/IETHManagement.sol";
import {IFeeManagement} from "../../src/bridge/interfaces/IFeeManagement.sol";
import {ILayerZeroBridge} from "../../src/bridge/interfaces/ILayerZeroBridge.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

// Contract that will revert when receiving ETH
contract RevertingReceiver {
    receive() external payable {
        revert("ETH transfer not allowed");
    }

    function callWithdrawETH(address bridge, uint256 amount) external {
        IETHManagement(bridge).withdrawETH(amount);
    }
}

contract BridgeTestEthBalance is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private user = address(0x1);
    address private owner = address(this);

    // Test contract
    TestETHManagement private testContract;

    // LZ data
    uint32 private eid = 1;

    function setUp() public override {
        vm.deal(user, 1000 ether);
        vm.deal(owner, 1000 ether);

        super.setUp();
        setUpEndpoints(1, LibraryType.UltraLightNode);

        testContract = TestETHManagement(
            payable(
                _deployOApp(
                    type(TestETHManagement).creationCode,
                    abi.encode(address(endpoints[eid]), owner)
                )
            )
        );

        vm.deal(address(testContract), 100 ether);
    }

    // ============ ETH Deposit Tests ============

    function test_depositETH() public {
        uint256 initialBalance = address(testContract).balance;
        uint256 depositAmount = 10 ether;

        vm.prank(user);
        testContract.depositETH{value: depositAmount}();

        assertEq(
            address(testContract).balance,
            initialBalance + depositAmount,
            "Contract balance should increase"
        );
    }

    function test_depositETH_emitsEvent() public {
        uint256 depositAmount = 5 ether;

        vm.expectEmit(true, false, false, true);
        emit IETHManagement.ETHDeposited(user, depositAmount);

        vm.prank(user);
        testContract.depositETH{value: depositAmount}();
    }

    function test_depositETH_anyoneCanDeposit() public {
        address randomUser = address(0x999);
        vm.deal(randomUser, 10 ether);

        vm.prank(randomUser);
        testContract.depositETH{value: 5 ether}();

        assertEq(address(testContract).balance, 105 ether, "Balance should increase");
    }

    // ============ ETH Withdrawal Tests ============

    function test_withdrawETH_onlyOwner() public {
        uint256 withdrawAmount = 10 ether;
        uint256 initialOwnerBalance = owner.balance;
        uint256 initialContractBalance = address(testContract).balance;

        testContract.withdrawETH(withdrawAmount);

        assertEq(
            owner.balance,
            initialOwnerBalance + withdrawAmount,
            "Owner balance should increase"
        );
        assertEq(
            address(testContract).balance,
            initialContractBalance - withdrawAmount,
            "Contract balance should decrease"
        );
    }

    function test_withdrawETH_revertsIfNotOwner() public {
        uint256 withdrawAmount = 10 ether;

        vm.prank(user);
        vm.expectRevert();
        testContract.withdrawETH(withdrawAmount);
    }

    function test_withdrawETH_revertsIfInsufficientBalance() public {
        uint256 contractBalance = address(testContract).balance;
        uint256 withdrawAmount = contractBalance + 1 ether;

        vm.expectRevert(
            abi.encodeWithSelector(
                IFeeManagement.InsufficientETHBalance.selector,
                withdrawAmount,
                contractBalance
            )
        );
        testContract.withdrawETH(withdrawAmount);
    }

    function test_withdrawETH_emitsEvent() public {
        uint256 withdrawAmount = 5 ether;

        vm.expectEmit(true, false, false, true);
        emit IETHManagement.ETHWithdrawn(owner, withdrawAmount);

        testContract.withdrawETH(withdrawAmount);
    }

    function test_withdrawETH_revertsIfTransferFails() public {
        RevertingReceiver receiver = new RevertingReceiver();
        vm.deal(address(receiver), 0);

        TestETHManagement revertingContract = TestETHManagement(
            payable(
                _deployOApp(
                    type(TestETHManagement).creationCode,
                    abi.encode(address(endpoints[eid]), address(receiver))
                )
            )
        );

        vm.deal(address(revertingContract), 10 ether);

        vm.expectRevert(
            abi.encodeWithSelector(IETHManagement.ETHTransferFailed.selector, address(receiver), 5 ether)
        );

        vm.prank(address(receiver));
        revertingContract.withdrawETH(5 ether);
    }

    // ============ Get ETH Balance Tests ============

    function test_getETHBalance() public view {
        uint256 balance = testContract.getETHBalance();
        assertEq(balance, 100 ether, "Should return correct balance");
    }

    function test_getETHBalance_afterDeposit() public {
        vm.prank(user);
        testContract.depositETH{value: 20 ether}();

        uint256 balance = testContract.getETHBalance();
        assertEq(balance, 120 ether, "Should return updated balance");
    }

    // ============ Receive Function Tests ============

    function test_receive() public {
        uint256 initialBalance = address(testContract).balance;
        uint256 sendAmount = 5 ether;

        (bool success, ) = address(testContract).call{value: sendAmount}("");
        assertTrue(success, "Receive should succeed");

        assertEq(
            address(testContract).balance,
            initialBalance + sendAmount,
            "Balance should increase"
        );
    }

    // ============ Fee Management Tests ============

    function test_setLzReceiveCost() public {
        uint128 newCost = 2000000;
        testContract.setLzReceiveCost(newCost);

        uint128 retrievedCost = testContract.getLzReceiveCost();
        assertEq(retrievedCost, newCost, "Cost should be updated");
    }

    function test_setLzReceiveCost_onlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        testContract.setLzReceiveCost(1000000);
    }

    function test_setLzReceiveCost_emitsEvent() public {
        uint128 newCost = 1500000;

        vm.expectEmit(false, false, false, true);
        emit IFeeManagement.LzReceiveCostUpdated(newCost);

        testContract.setLzReceiveCost(newCost);
    }

    function test_setGasThresholds() public {
        uint256 warningThreshold = 0.5 ether;
        uint256 criticalThreshold = 0.2 ether;

        testContract.setGasThresholds(warningThreshold, criticalThreshold);

        (uint256 warning, uint256 critical) = testContract.getGasThresholds();
        assertEq(warning, warningThreshold, "Warning threshold should be set");
        assertEq(critical, criticalThreshold, "Critical threshold should be set");
    }

    function test_setGasThresholds_onlyOwner() public {
        vm.prank(user);
        vm.expectRevert();
        testContract.setGasThresholds(0.5 ether, 0.2 ether);
    }

    function test_setGasThresholds_revertsIfInvalid() public {
        uint256 warningThreshold = 0.2 ether;
        uint256 criticalThreshold = 0.5 ether; // Critical > Warning (invalid)

        vm.expectRevert(
            abi.encodeWithSelector(
                IFeeManagement.InvalidThresholdValues.selector,
                warningThreshold,
                criticalThreshold
            )
        );
        testContract.setGasThresholds(warningThreshold, criticalThreshold);
    }

    function test_setGasThresholds_revertsIfEqual() public {
        uint256 threshold = 0.5 ether;

        vm.expectRevert(
            abi.encodeWithSelector(
                IFeeManagement.InvalidThresholdValues.selector,
                threshold,
                threshold
            )
        );
        testContract.setGasThresholds(threshold, threshold);
    }

    function test_setGasThresholds_emitsEvent() public {
        uint256 warningThreshold = 0.5 ether;
        uint256 criticalThreshold = 0.2 ether;

        vm.expectEmit(false, false, false, true);
        emit IFeeManagement.GasThresholdsUpdated(warningThreshold, criticalThreshold);

        testContract.setGasThresholds(warningThreshold, criticalThreshold);
    }

    function test_getGasThresholds() public {
        (uint256 warning, uint256 critical) = testContract.getGasThresholds();
        assertGt(warning, 0, "Warning threshold should be set");
        assertGt(critical, 0, "Critical threshold should be set");
        assertGt(warning, critical, "Warning should be greater than critical");
    }

    // ============ Gas Threshold Monitoring Tests ============

    function test_gasThresholdMonitoring_critical() public {
        uint256 warningThreshold = 0.5 ether;
        uint256 criticalThreshold = 0.2 ether;
        testContract.setGasThresholds(warningThreshold, criticalThreshold);

        // Set balance below critical threshold
        vm.deal(address(testContract), 0.1 ether);

        vm.expectEmit(false, false, false, true);
        emit IFeeManagement.GasReserveCritical(0.1 ether);

        // Withdrawing will trigger threshold check
        vm.deal(address(testContract), 0.15 ether);
        testContract.withdrawETH(0.05 ether); // Leaves 0.1 ether
    }

    function test_gasThresholdMonitoring_warning() public {
        uint256 warningThreshold = 0.5 ether;
        uint256 criticalThreshold = 0.2 ether;
        testContract.setGasThresholds(warningThreshold, criticalThreshold);

        // Set balance below warning but above critical
        vm.deal(address(testContract), 0.3 ether);

        vm.expectEmit(false, false, false, true);
        emit IFeeManagement.GasReserveLow(0.3 ether);

        // Withdrawing will trigger threshold check
        vm.deal(address(testContract), 0.35 ether);
        testContract.withdrawETH(0.05 ether); // Leaves 0.3 ether
    }

    // ============ Bridge Config Tests ============

    function test_setBridgeConfig() public {
        BridgeTypes.BridgeConfig memory newConfig = BridgeTypes.BridgeConfig({
            remoteEid: 999,
            remoteBridge: address(0x1234)
        });

        testContract.setBridgeConfig(newConfig);

        BridgeTypes.BridgeConfig memory retrieved = testContract.getBridgeConfig();
        assertEq(retrieved.remoteEid, 999, "Remote EID should be set");
        assertEq(retrieved.remoteBridge, address(0x1234), "Remote bridge should be set");
    }

    function test_setBridgeConfig_onlyOwner() public {
        BridgeTypes.BridgeConfig memory newConfig = BridgeTypes.BridgeConfig({
            remoteEid: 999,
            remoteBridge: address(0x1234)
        });

        vm.prank(user);
        vm.expectRevert();
        testContract.setBridgeConfig(newConfig);
    }

    function test_setBridgeConfig_emitsEvent() public {
        BridgeTypes.BridgeConfig memory newConfig = BridgeTypes.BridgeConfig({
            remoteEid: 999,
            remoteBridge: address(0x1234)
        });

        vm.expectEmit(true, true, false, true);
        emit ILayerZeroBridge.BridgeConfigUpdated(newConfig);

        testContract.setBridgeConfig(newConfig);
    }
}
