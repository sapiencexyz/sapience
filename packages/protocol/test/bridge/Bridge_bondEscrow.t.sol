// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridge} from "../../src/bridge/MarketLayerZeroBridge.sol";
import {UMALayerZeroBridge} from "../../src/bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol"; 
import {MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol"; 
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

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

        marketBridge = MarketLayerZeroBridge(payable(
            _deployOApp(type(MarketLayerZeroBridge).creationCode, abi.encode(address(endpoints[marketEiD]), address(this)))
        ));

        umaBridge = UMALayerZeroBridge(payable( 
            _deployOApp(type(UMALayerZeroBridge).creationCode, abi.encode(address(endpoints[umaEiD]), address(this)))
        ));

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

        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        umaBridge.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: marketEiD,
            remoteBridge: address(marketBridge)
        }));

        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteEid: umaEiD,
            remoteBridge: address(umaBridge)
        }));

    }

    function test_failsIfWrongDepositAmount() public {
        vm.startPrank(umaUser);
        vm.expectRevert("Amount must be greater than 0");
        umaBridge.depositBond(address(bondCurrency), 0);
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
        umaBridge.intentToWithdrawBond(address(bondCurrency), .5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("Withdrawal intent already exists");
        umaBridge.intentToWithdrawBond(address(bondCurrency), .1 ether);
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
        umaBridge.intentToWithdrawBond(address(bondCurrency), .5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("Waiting period not over");
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();
    }

    function test_failsIfWithdrawalIntentAlreadyExecuted() public {
        _depositBond(umaUser, 1 ether);
        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), .5 ether);
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.warp(block.timestamp + 1 days);
        umaBridge.executeWithdrawal(address(bondCurrency));
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));
        vm.expectRevert("Withdrawal already executed");
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

        uint256 initialRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
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

        uint256 finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
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
        (uint256 initialUserPendingWithdrawal, uint256 initialUserPendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        uint256 initialRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 initialRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));

        vm.startPrank(umaUser);
        uint256 currentTimestamp = block.timestamp;
        umaBridge.intentToWithdrawBond(address(bondCurrency), .5 ether);
        vm.stopPrank();

        // From token balance movements (no change, is intent)
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserTokenBalance, initialUmaUserTokenBalance );
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance );

        // From escrow balance movements
        uint256 finalUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalUserBondBalance, initialUserBondBalance);

        (uint256 finalUserPendingWithdrawal, uint256 finalUserPendingWithdrawalTimestamp) = umaBridge.getPendingWithdrawal(umaUser, address(bondCurrency));
        assertEq(finalUserPendingWithdrawal, initialUserPendingWithdrawal + .5 ether);
        assertEq(finalUserPendingWithdrawalTimestamp, currentTimestamp);

        uint256 finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 finalRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance, "Message is not propagated through LZ (balance)");
        assertEq(finalRemoteUserWithdrawalIntent, initialRemoteUserWithdrawalIntent, "Message is not propagated through LZ (intent)");

        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance, "No change in balance");
        finalRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserWithdrawalIntent, initialRemoteUserWithdrawalIntent + .5 ether, "Message is propagated through LZ (intent)");
    }

    function test_Escrow_withdraw() public {
        _depositBond(umaUser, 1 ether);

        vm.startPrank(umaUser);
        uint256 currentTimestamp = block.timestamp;
        umaBridge.intentToWithdrawBond(address(bondCurrency), .5 ether);
        vm.stopPrank();
        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Collect the escrowed bond data
        uint256 initialUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 initialUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        uint256 initialRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 initialRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));

        // Wait for the withdrawal intent to expire
        vm.warp(block.timestamp + 1 days);

        // Execute the withdrawal
        vm.startPrank(umaUser);
        umaBridge.executeWithdrawal(address(bondCurrency));
        vm.stopPrank();

        // Verify the balance movements (token)
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserTokenBalance, initialUmaUserTokenBalance + .5 ether);
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance - .5 ether);

        // Verify the balance movements (escrow)
        uint256 finalUserBondBalance = umaBridge.getBondBalance(umaUser, address(bondCurrency));
        assertEq(finalUserBondBalance, initialUserBondBalance - .5 ether);

        // Verify the balance movements (market)
        // Before the propagation
        uint256 finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        uint256 finalRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance, "Message is not propagated through LZ (balance)");
        assertEq(finalRemoteUserWithdrawalIntent, initialRemoteUserWithdrawalIntent, "Message is not propagated through LZ (intent)");

        // Verify packets for marketBridge (bridge through LZ)
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // After the propagation
        finalRemoteUserBondBalance = marketBridge.getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserBondBalance, initialRemoteUserBondBalance - .5 ether, "Message is propagated through LZ (balance)");
        finalRemoteUserWithdrawalIntent = marketBridge.getRemoteSubmitterWithdrawalIntent(address(umaUser), address(bondCurrency));
        assertEq(finalRemoteUserWithdrawalIntent, initialRemoteUserWithdrawalIntent - .5 ether, "Message is propagated through LZ (intent)");

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
