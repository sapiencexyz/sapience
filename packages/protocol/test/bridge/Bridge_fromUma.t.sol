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
import {ISapienceStructs} from "../../src/market/interfaces/ISapienceStructs.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTestFromUma is TestHelperOz5 {
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
    }

    function test_failsNotUma_Resolved() public {
        vm.startPrank(marketUser);
        vm.expectRevert("Only the OptimisticOracleV3 can call this function");
        umaBridge.assertionResolvedCallback(bytes32(0), true);
        vm.stopPrank();
    }

    function test_failsNotUma_Disputed() public {
        vm.startPrank(marketUser);
        vm.expectRevert("Only the OptimisticOracleV3 can call this function");
        umaBridge.assertionDisputedCallback(bytes32(0));
        vm.stopPrank();
    }

    function test_failsIfWrongAssertionId_Resolved() public {
        vm.startPrank(address(mockOptimisticOracleV3));
        vm.expectRevert("Invalid assertion ID");
        umaBridge.assertionResolvedCallback(bytes32(0), true);
        vm.stopPrank();
    }

    function test_failsIfWrongAssertionId_Disputed() public {
        vm.startPrank(address(mockOptimisticOracleV3));
        vm.expectRevert("Invalid assertion ID");
        umaBridge.assertionDisputedCallback(bytes32(0));
        vm.stopPrank();
    }

    function test_resolved() public {
        uint256 initialUmaUserBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 initialMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        mockOptimisticOracleV3.resolveAssertion(umaAssertionId, true);

        // Check the balances on UMA side (before and after the propagation)
        uint256 finalUmaUserBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 finalMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        assertEq(finalUmaUserBalance, initialUmaUserBalance + BOND_AMOUNT, "UMA user balance should increase");
        assertEq(finalUmaBridgeBalance, initialUmaBridgeBalance, "UMA bridge balance should be the same");
        assertEq(
            finalMockOptimisticOracleV3Balance,
            initialMockOptimisticOracleV3Balance - BOND_AMOUNT,
            "Mock optimistic oracle balance should decrease"
        );

        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Check the balances on UMA side (after the propagation)
        finalUmaUserBalance = bondCurrency.balanceOf(umaUser);
        finalUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        finalMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        assertEq(
            finalUmaUserBalance,
            initialUmaUserBalance + BOND_AMOUNT,
            "UMA user balance should increase (after propagation)"
        );
        assertEq(
            finalUmaBridgeBalance, initialUmaBridgeBalance, "UMA bridge balance should be the same (after propagation)"
        );
        assertEq(
            finalMockOptimisticOracleV3Balance,
            initialMockOptimisticOracleV3Balance - BOND_AMOUNT,
            "Mock optimistic oracle balance should decrease (after propagation)"
        );

        // Check state of the market group
        MockMarketGroup.AssertionData memory assertionData = mockMarketGroup.getAssertionData(marketAssertionId);
        assertEq(assertionData.resolved, true, "Market group should be resolved");
        assertEq(assertionData.disputed, false, "Market group should not be disputed");
        assertEq(assertionData.assertedTruthfully, true, "Market group should be resolved truthfully");
    }

    function test_disputed() public {
        uint256 initialUmaUserBalance = bondCurrency.balanceOf(umaUser);
        uint256 initialUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 initialMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        mockOptimisticOracleV3.disputeAssertion(umaAssertionId);

        // Check the balances on UMA side (before and after the propagation)
        uint256 finalUmaUserBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        uint256 finalMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        assertEq(finalUmaUserBalance, initialUmaUserBalance, "UMA user balance should be the same (bond lost)");
        assertEq(finalUmaBridgeBalance, initialUmaBridgeBalance, "UMA bridge balance should be the same");
        assertEq(
            finalMockOptimisticOracleV3Balance,
            initialMockOptimisticOracleV3Balance - BOND_AMOUNT,
            "Mock optimistic oracle balance should decrease"
        );

        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Check the balances on UMA side (after the propagation)
        finalUmaUserBalance = bondCurrency.balanceOf(umaUser);
        finalUmaBridgeBalance = bondCurrency.balanceOf(address(umaBridge));
        finalMockOptimisticOracleV3Balance = bondCurrency.balanceOf(address(mockOptimisticOracleV3));

        assertEq(finalUmaUserBalance, initialUmaUserBalance, "UMA user balance should be the same (after propagation)");
        assertEq(
            finalUmaBridgeBalance, initialUmaBridgeBalance, "UMA bridge balance should be the same (after propagation)"
        );
        assertEq(
            finalMockOptimisticOracleV3Balance,
            initialMockOptimisticOracleV3Balance - BOND_AMOUNT,
            "Mock optimistic oracle balance should decrease (after propagation)"
        );

        // Check state of the market group
        MockMarketGroup.AssertionData memory assertionData = mockMarketGroup.getAssertionData(marketAssertionId);
        assertEq(assertionData.resolved, false, "Market group should not be resolved");
        assertEq(assertionData.disputed, true, "Market group should be disputed");
        assertEq(assertionData.assertedTruthfully, false, "Market group should be disputed truthfully");
    }
}
