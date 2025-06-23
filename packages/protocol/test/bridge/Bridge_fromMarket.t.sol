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

contract BridgeTest is TestHelperOz5 {
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
    address private optimisticOracleV3;

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

        vm.deal(address(umaBridge), 100 ether);
        vm.deal(address(marketBridge), 100 ether);

        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        umaBridge.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteChainId: marketEiD,
            remoteBridge: address(marketBridge),
            settlementModule: address(0)
        }));

        marketBridge.setBridgeConfig(BridgeTypes.BridgeConfig({
            remoteChainId: umaEiD,
            remoteBridge: address(umaBridge),
            settlementModule: address(0)
        }));

        // Deposit bond to the escrow
        uint256 depositAmount = 100 * BOND_AMOUNT;
        bondCurrency.mint(depositAmount, umaUser);
        vm.startPrank(umaUser);
        bondCurrency.approve(address(umaBridge), depositAmount);
        umaBridge.depositBond(address(bondCurrency), depositAmount);
        vm.stopPrank();
        verifyPackets(marketEiD, addressToBytes32(address(marketBridge)));

        // Enable the market group
        marketBridge.enableMarketGroup(marketGroup);
    }

    function test_failsIfNotEnabledMarketGroup_LEO() public {
        vm.startPrank(marketUser);
        vm.expectRevert("Only enabled market groups can submit");
        /*
             address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter,
        uint64 liveness,
        IERC20 currency,
        uint256 bond
        */
        marketBridge.forwardAssertTruth(address(marketUser), 1, "some claim message", address(marketUser), 3600, address(bondCurrency), 1 ether);
        vm.stopPrank();
    }

    function test_forwardAssertTruth() public {
        // Forward the assertion to the optimisticOracleV3
        vm.startPrank(marketUser);
        marketBridge.forwardAssertTruth(address(marketUser), 1, "some claim message", address(marketUser), 3600, address(bondCurrency), 1 ether);
        vm.stopPrank();

        // Verify the balance movements (token)
        uint256 finalUmaUserTokenBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaTokenBalance = bondCurrency.balanceOf(address(umaBridge));
    }
}
