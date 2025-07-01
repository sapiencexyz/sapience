// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridge} from "../../src/bridge/MarketLayerZeroBridge.sol";
import {UMALayerZeroBridge} from "../../src/bridge/UMALayerZeroBridge.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol";
import {MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {MockOptimisticOracleV3} from "./mocks/mockOptimisticOracleV3.sol";
import {MockMarketGroup} from "./mocks/mockMarketGroup.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTestFromMarket is TestHelperOz5 {
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
    MockOptimisticOracleV3 private mockOptimisticOracleV3;
    MockMarketGroup private mockMarketGroup;

    // LZ data
    uint32 private umaEiD = 1;
    uint32 private marketEiD = 2;

    address umaEndpoint;
    address marketEndpoint;

    uint256 private BOND_AMOUNT = 1_000 ether;

    function setUp() public override {
        vm.deal(umaUser, 1000 ether);
        vm.deal(marketUser, 1000 ether);
        vm.deal(owner, 1000 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        marketBridge = MarketLayerZeroBridge(
            payable(
                _deployOApp(
                    type(MarketLayerZeroBridge).creationCode,
                    abi.encode(address(endpoints[marketEiD]), address(this))
                )
            )
        );

        umaBridge = UMALayerZeroBridge(
            payable(
                _deployOApp(
                    type(UMALayerZeroBridge).creationCode,
                    abi.encode(address(endpoints[umaEiD]), address(this))
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

        umaBridge.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: marketEiD,
                remoteBridge: address(marketBridge)
            })
        );

        umaBridge.setOptimisticOracleV3(address(mockOptimisticOracleV3));

        marketBridge.setBridgeConfig(
            BridgeTypes.BridgeConfig({
                remoteEid: umaEiD,
                remoteBridge: address(umaBridge)
            })
        );

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

        // Enable the market group
        marketBridge.enableMarketGroup(address(mockMarketGroup));
    }

    function test_failsIfNotEnabledMarketGroup() public {
        vm.startPrank(marketUser);
        vm.expectRevert("Only enabled market groups can submit");
        marketBridge.forwardAssertTruth(
            address(marketUser),
            1,
            "some claim message",
            address(marketUser),
            3600,
            address(bondCurrency),
            BOND_AMOUNT
        );
        vm.stopPrank();
    }

    function test_failsIfNotEnoughBond() public {
        uint256 userRemoteBondBalance = marketBridge.getRemoteSubmitterBalance(
            address(umaUser),
            address(bondCurrency)
        );

        // Check it reverts
        vm.startPrank(address(mockMarketGroup));
        vm.expectRevert("Asserter does not have enough bond");
        marketBridge.forwardAssertTruth(
            address(marketUser),
            1,
            "some claim message",
            address(umaUser),
            3600,
            address(bondCurrency),
            userRemoteBondBalance + 1
        );
        vm.stopPrank();

        // Confirm it pass with enough bond
        vm.startPrank(address(mockMarketGroup));
        marketBridge.forwardAssertTruth(
            address(marketUser),
            1,
            "some claim message",
            address(umaUser),
            3600,
            address(bondCurrency),
            userRemoteBondBalance
        );
        vm.stopPrank();
    }

    function test_failsIfNotEnoughBondAndIntentToWithdraw() public {
        uint256 userRemoteBondBalance = marketBridge.getRemoteSubmitterBalance(
            address(umaUser),
            address(bondCurrency)
        );
        uint256 intentToWithdraw = userRemoteBondBalance / 2;
        uint256 availableBond = userRemoteBondBalance - intentToWithdraw;

        vm.startPrank(umaUser);
        umaBridge.intentToWithdrawBond(address(bondCurrency), intentToWithdraw);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Check it reverts
        vm.startPrank(address(mockMarketGroup));
        vm.expectRevert("Asserter does not have enough bond");
        marketBridge.forwardAssertTruth(
            address(marketUser),
            1,
            "some claim message",
            address(umaUser),
            3600,
            address(bondCurrency),
            availableBond + 1
        );
        vm.stopPrank();

        // Confirm it pass with enough bond
        vm.startPrank(address(mockMarketGroup));
        marketBridge.forwardAssertTruth(
            address(marketUser),
            1,
            "some claim message",
            address(umaUser),
            3600,
            address(bondCurrency),
            availableBond
        );
        vm.stopPrank();
    }

    function test_forwardAssertTruth() public {
        // Verify the balance movements (token)
        uint256 initialUmaTokenBalance = bondCurrency.balanceOf(
            address(umaBridge)
        );
        uint256 initialUserBondBalance = umaBridge.getBondBalance(
            umaUser,
            address(bondCurrency)
        );
        uint256 initialUserRemoteBondBalance = marketBridge
            .getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));

        // Forward the assertion to the optimisticOracleV3
        mockMarketGroup.setAssertThruthData(
            "some claim message",
            3600,
            address(bondCurrency),
            BOND_AMOUNT
        );
        bytes32 assertionId = mockMarketGroup.submitSettlementPrice(1, address(umaUser), 1);

        // Verify the balance movements (token)
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(
            address(umaBridge)
        );
        uint256 finalUserBondBalance = umaBridge.getBondBalance(
            umaUser,
            address(bondCurrency)
        );
        uint256 finalUserRemoteBondBalance = marketBridge
            .getRemoteSubmitterBalance(address(umaUser), address(bondCurrency));

        // Before propagating the assertion, the balance should be the same
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance);
        assertEq(finalUserBondBalance, initialUserBondBalance);
        assertEq(
            finalUserRemoteBondBalance,
            initialUserRemoteBondBalance - BOND_AMOUNT
        );

        uint256 initialMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        // Propagate the assertion
        verifyPackets(umaEiD, addressToBytes32(address(umaBridge)));
        bytes32 umaAssertionId = mockOptimisticOracleV3.getLastAssertionId();
        MockOptimisticOracleV3.AssertionData memory umaAssertionData = mockOptimisticOracleV3.getAssertionData(umaAssertionId);

        uint256 finalMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));
        assertEq(finalMockOptimisticOracleV3Balance, initialMockOptimisticOracleV3Balance + BOND_AMOUNT);
        assertEq(umaAssertionData.claim, "some claim message");
        assertEq(umaAssertionData.liveness, 3600);
        assertEq(address(umaAssertionData.bondToken), address(bondCurrency));
        assertEq(umaAssertionData.bondAmount, BOND_AMOUNT);


        // After propagating the assertion, the balance should be different
        finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));
        finalUserBondBalance = umaBridge.getBondBalance(
            umaUser,
            address(bondCurrency)
        );
        finalUserRemoteBondBalance = marketBridge.getRemoteSubmitterBalance(
            address(umaUser),
            address(bondCurrency)
        );
        assertEq(finalUmaTokenBalance, initialUmaTokenBalance - BOND_AMOUNT);
        assertEq(finalUserBondBalance, initialUserBondBalance - BOND_AMOUNT);
        assertEq(
            finalUserRemoteBondBalance,
            initialUserRemoteBondBalance - BOND_AMOUNT
        );
    }
}
