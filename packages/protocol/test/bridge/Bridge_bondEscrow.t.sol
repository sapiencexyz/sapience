// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridge} from "../../src/bridge/MarketLayerZeroBridge.sol";
import {UMALayerZeroBridge} from "../../src/bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

// Simple ERC20 token for testing
contract TestToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}

contract BridgeTestBondEscrow is TestHelperOz5 {
    using Cannon for Vm;


    // Users
    address private umaUser = address(0x1);
    address private marketUser = address(0x2);
    address private owner = address(0x3);
    address private refundAddress = address(0x4);

    // Bridges
    MarketLayerZeroBridge private marketBridge;
    UMALayerZeroBridge private umaBridge;

    // Other contracts
    IMintableToken private bondCurrency;
    address private optimisticOracleV3;

    // LZ data
    uint32 private umaEiD = 1;
    uint32 private marketEiD = 2;

    address umaEndpoint;
    address marketEndpoint;

    function setUp() public override {
        vm.deal(umaUser, 1000 ether);
        vm.deal(marketUser, 1000 ether);
        vm.deal(owner, 1000 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));

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
                    type(UMALayerZeroBridge).creationCode, abi.encode(address(endpoints[umaEiD]), address(this), address(bondCurrency), 500000000)
                )
            )
        );

        address[] memory oapps = new address[](2);
        oapps[0] = address(marketBridge);
        oapps[1] = address(umaBridge);
        this.wireOApps(oapps);

        umaEndpoint = address(umaBridge.endpoint());
        marketEndpoint = address(marketBridge.endpoint());

        marketBridge.setLzReceiveCost(1000000);
        umaBridge.setLzReceiveCost(1000000);

        marketBridge.setGasThresholds(0.01 ether, 0.005 ether);
        umaBridge.setGasThresholds(0.1 ether, 0.05 ether);

        vm.deal(address(umaBridge), 100 ether);
        vm.deal(address(marketBridge), 100 ether);

        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        umaBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: marketEiD, remoteBridge: address(marketBridge)}));

        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({remoteEid: umaEiD, remoteBridge: address(umaBridge)}));
    }

    function test_failsIfWrongDepositAmount() public {
        vm.startPrank(umaUser);
        vm.expectRevert("Amount must be greater than minimum deposit amount");
        umaBridge.depositBond(address(bondCurrency), 499999999);
        vm.stopPrank();
    }

    function test_failsIfWrongDepositToken() public {
        // Deploy a different token to test wrong deposit token
        TestToken wrongToken = new TestToken("Wrong Token", "WRONG");
        vm.startPrank(umaUser);
        vm.expectRevert("Invalid bond token");
        umaBridge.depositBond(address(wrongToken), 1 ether);
        vm.stopPrank();
    }

    function test_failsIfWrongIntentToWithdrawAmount() public {
        vm.startPrank(umaUser);
        vm.expectRevert("Amount must be greater than 0");
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0);
        vm.stopPrank();
    }

    function test_failsIfInsufficientBalance_Intent() public {
        vm.startPrank(umaUser);
        vm.expectRevert("Insufficient balance");
        umaBridge.intentToWithdrawBond(address(bondCurrency), 1);
        vm.stopPrank();
    }

    function test_failsIfWithdrawalIntentAlreadyExists() public {
        _depositBond(umaUser, 1 ether);
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("Withdrawal intent already exists");
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.1 ether);
        vm.stopPrank();
    }

    function test_failsIfWithdrawalIntentNotExists() public {
        vm.startPrank(umaUser);
        vm.expectRevert("No withdrawal intent");
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
    }

    function test_failsIfWithdrawalIntentNotExpired() public {
        _depositBond(umaUser, 1 ether);
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("Waiting period not over");
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
    }

    function test_failsIfWithdrawalIntentAlreadyExecuted() public {
        _depositBond(umaUser, 1 ether);
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.warp(block.timestamp + 1 days);
        umaBridge.executeWithdrawal(address(bondCurrency));
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("No withdrawal intent");
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
    }

    function test_failsIfInsufficientBalance_Withdrawal() public {
        // TODO: Implement this
        // The test should ensure balance is bond * (1.5)
        // create an intent to withdraw (and don't propagate it) of bond
        // from market, forwardAssertTruth with bond
        // propagate the message (from marketBridge)
        // This should send the escrowed bond to the optimisticOracleV3
        // (now available balance in the escrow should be .5 bond)
        // from uma, attempt to withdraw the intent posted before
        // It should revert with "Insufficient balance"
    }

    function test_Escrow_deposit() public {
        bondCurrency.mint(1 ether, umaUser);

        uint256 initialUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        uint256 initialRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 initialUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));

        vm.startPrank(umaUser);
        bondCurrency.approve(address(umaBridge), 1 ether);
        umaBridge.depositBond(address(bondCurrency), 1 ether);
        vm.stopPrank();

        // From token balance movements
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserTokenBalance, initialUmaUserTokenBalance - 1 ether);
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance + 1 ether);

        // From escrow balance movements
        uint256 finalUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalUserBondBalance, initialUserBondBalance + 1 ether);

        uint256 finalRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance, "Message is still not propagated through LZ");
        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance + 1 ether, "Message is propagated through LZ");
    }

    function test_Escrow_intentToWithdraw() public {
        _depositBond(umaUser, 1 ether);
        uint256 initialUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 initialUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        (uint256 initialUserPendingWithdrawal,) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        uint256 initialRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 initialRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));

        vm.startPrank(umaUser);
        uint256 currentTimestamp = block.timestamp;
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();

        // From token balance movements (no change, is intent)
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserTokenBalance, initialUmaUserTokenBalance);
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance);

        // From escrow balance movements
        uint256 finalUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalUserBondBalance, initialUserBondBalance);

        (uint256 finalUserPendingWithdrawal, uint256 finalUserPendingWithdrawalTimestamp) =
            umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(finalUserPendingWithdrawal, initialUserPendingWithdrawal + 0.5 ether);
        assertEq(finalUserPendingWithdrawalTimestamp, currentTimestamp);

        uint256 finalRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 finalRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(
            finalRemoteUserBondBalance, initialRemoteUserBondBalance, "Message is not propagated through LZ (balance)"
        );
        assertEq(
            finalRemoteUserWithdrawalIntent,
            initialRemoteUserWithdrawalIntent,
            "Message is not propagated through LZ (intent)"
        );

        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance, "No change in balance");
        finalRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(
            finalRemoteUserWithdrawalIntent,
            initialRemoteUserWithdrawalIntent + 0.5 ether,
            "Message is propagated through LZ (intent)"
        );
    }

    function test_Escrow_withdraw() public {
        _depositBond(umaUser, 1 ether);

        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();
        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Collect the escrowed bond data
        uint256 initialUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 initialUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        uint256 initialRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 initialRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));

        // Wait for the withdrawal intent to expire
        vm.warp(block.timestamp + 1 days);

        // Execute the withdrawal
        vm.startPrank(umaUser);
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();

        // Verify the balance movements (token)
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserTokenBalance, initialUmaUserTokenBalance + 0.5 ether);
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance - 0.5 ether);

        // Verify the balance movements (escrow)
        uint256 finalUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalUserBondBalance, initialUserBondBalance - 0.5 ether);

        // Verify the balance movements (market)
        // Before the propagation
        uint256 finalRemoteUserBondBalance =
            marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 finalRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(
            finalRemoteUserBondBalance, initialRemoteUserBondBalance, "Message is not propagated through LZ (balance)"
        );
        assertEq(
            finalRemoteUserWithdrawalIntent,
            initialRemoteUserWithdrawalIntent,
            "Message is not propagated through LZ (intent)"
        );

        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // After the propagation
        finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(
            finalRemoteUserBondBalance,
            initialRemoteUserBondBalance - 0.5 ether,
            "Message is propagated through LZ (balance)"
        );
        finalRemoteUserWithdrawalIntent =
            marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(
            finalRemoteUserWithdrawalIntent,
            initialRemoteUserWithdrawalIntent - 0.5 ether,
            "Message is propagated through LZ (intent)"
        );
    }

    function test_newIntentCanBeSetAfterWithdrawalExecuted() public {
        _depositBond(umaUser, 1 ether);
        
        // Set initial withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Wait for withdrawal intent to expire and execute it
        vm.warp(block.timestamp + 1 days);
        vm.startPrank(umaUser);
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify that the withdrawal intent is cleared
        (uint256 pendingWithdrawal, uint256 pendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(pendingWithdrawal, 0, "Pending withdrawal should be cleared after execution");
        assertEq(pendingWithdrawalTimestamp, 0, "Pending withdrawal timestamp should be cleared after execution");
        
        // Set a new withdrawal intent for the remaining balance
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.3 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify that the new intent is set correctly
        (pendingWithdrawal, pendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(pendingWithdrawal, 0.3 ether, "New withdrawal intent should be set");
        assertEq(pendingWithdrawalTimestamp, block.timestamp, "New withdrawal intent timestamp should be set");
        
        // Verify remote bridge also has the new intent
        uint256 remoteWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(remoteWithdrawalIntent, 0.3 ether, "Remote bridge should have the new withdrawal intent");
    }    

    function test_removeWithdrawalIntent_success() public {
        _depositBond(umaUser, 1 ether);
        
        // Create withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify intent is set
        (uint256 initialPendingWithdrawal, uint256 initialPendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(initialPendingWithdrawal, 0.5 ether, "Withdrawal intent should be set");
        assertEq(initialPendingWithdrawalTimestamp, block.timestamp, "Withdrawal intent timestamp should be set");
        
        // Wait for withdrawal delay period
        vm.warp(block.timestamp + 1 days);
        
        // Remove withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.removeWithdrawalIntent(address(bondCurrency));
        vm.stopPrank();
        
        // Verify intent is cleared locally
        (uint256 finalPendingWithdrawal, uint256 finalPendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(finalPendingWithdrawal, 0, "Withdrawal intent should be cleared");
        assertEq(finalPendingWithdrawalTimestamp, 0, "Withdrawal intent timestamp should be cleared");
        
        // Verify message is propagated to remote bridge
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify remote bridge intent is also cleared
        uint256 remoteWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(remoteWithdrawalIntent, 0, "Remote bridge withdrawal intent should be cleared");
    }

    function test_removeWithdrawalIntent_failsIfZeroAddress() public {
        vm.startPrank(umaUser);
        vm.expectRevert("Bond token cannot be zero address");
        umaBridge.removeWithdrawalIntent(address(0));
        vm.stopPrank();
    }

    function test_removeWithdrawalIntent_failsIfWaitingPeriodNotOver() public {
        _depositBond(umaUser, 1 ether);
        
        // Create withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Try to remove intent before waiting period is over
        vm.startPrank(umaUser);
        vm.expectRevert("Waiting period not over");
        umaBridge.removeWithdrawalIntent(address(bondCurrency));
        vm.stopPrank();
    }

    function test_removeWithdrawalIntent_failsIfNoWithdrawalIntent() public {
        vm.startPrank(umaUser);
        vm.expectRevert("No withdrawal intent");
        umaBridge.removeWithdrawalIntent(address(bondCurrency));
        vm.stopPrank();
    }

    function test_removeWithdrawalIntent_afterPartialExecution() public {
        _depositBond(umaUser, 1 ether);
        
        // Create withdrawal intent for full amount
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 1 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Wait for withdrawal delay period
        vm.warp(block.timestamp + 1 days);
        
        // Execute partial withdrawal
        vm.startPrank(umaUser);
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify intent is cleared after execution
        (uint256 pendingWithdrawal, uint256 pendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(pendingWithdrawal, 0, "Withdrawal intent should be cleared after execution");
        assertEq(pendingWithdrawalTimestamp, 0, "Withdrawal intent timestamp should be cleared after execution");
        
        // Try to remove withdrawal intent (should fail as there's no intent)
        vm.startPrank(umaUser);
        vm.expectRevert("No withdrawal intent");
        umaBridge.removeWithdrawalIntent(address(bondCurrency));
        vm.stopPrank();
    }

    function test_removeWithdrawalIntent_preservesBondBalance() public {
        _depositBond(umaUser, 1 ether);
        
        // Create withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), 0.5 ether);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Record initial bond balance
        uint256 initialBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(initialBondBalance, 1 ether, "Initial bond balance should be 1 ether");
        
        // Wait for withdrawal delay period
        vm.warp(block.timestamp + 1 days);
        
        // Remove withdrawal intent
        vm.startPrank(umaUser);
        umaBridge.removeWithdrawalIntent(address(bondCurrency));
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        
        // Verify bond balance is unchanged
        uint256 finalBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalBondBalance, initialBondBalance, "Bond balance should remain unchanged after removing intent");
    }

    function _depositBond(address _user, uint256 _amount) internal {
        bondCurrency.mint(_amount, _user);
        vm.startPrank(_user);
        bondCurrency.approve(address(umaBridge), _amount);
        umaBridge.depositBond(address(bondCurrency), _amount);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
    }
}
