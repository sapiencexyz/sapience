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

contract BridgeTestSetup is TestHelperOz5 {
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

    bytes options;


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
    }

    function test_constructor() public {
        assertEq(address(marketBridge.owner()), address(this), "MarketBridge owner");
        assertEq(address(umaBridge.owner()), address(this), "UMABridge owner");

        assertEq(address(marketBridge.endpoint()), address(endpoints[marketEiD]), "MarketBridge endpoint");
        assertEq(address(umaBridge.endpoint()), address(endpoints[umaEiD]), "UMABridge endpoint");
    }

    function test_balances() public {
        assertEq(address(umaUser).balance, 1000 ether);
        assertEq(address(marketUser).balance, 1000 ether);
    }
}
