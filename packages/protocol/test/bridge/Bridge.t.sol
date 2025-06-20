// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {MarketLayerZeroBridge} from "../../src/bridge/MarketLayerZeroBridge.sol";
import {UMALayerZeroBridge} from "../../src/bridge/UMALayerZeroBridge.sol";
import {MessagingReceipt} from "@layerzerolabs/oapp-evm/contracts/oapp/OApp.sol"; 
import {MessagingParams} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol"; 

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTest is TestHelperOz5 {
    using Cannon for Vm;

    // Users
    address private umaUser = address(0x1);
    address private marketUser = address(0x2);
    address private owner = address(0x3);
    address private refundAddress = address(0x4);

    // Bridges
    MarketLayerZeroBridge private marketBridge;
    UMALayerZeroBridge private umaBridge;

    // LZ data
    uint32 private aEid = 1;
    uint32 private bEid = 2;
    address umaEndpoint;
    address marketEndpoint;

    bytes options;


    function setUp() public override {
        vm.deal(umaUser, 1000 ether);
        vm.deal(marketUser, 1000 ether);
        vm.deal(owner, 1000 ether);

        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);

        marketBridge = MarketLayerZeroBridge(
            _deployOApp(type(MarketLayerZeroBridge).creationCode, abi.encode(address(endpoints[aEid]), address(this)))
        );

        umaBridge = UMALayerZeroBridge(
            _deployOApp(type(UMALayerZeroBridge).creationCode, abi.encode(address(endpoints[bEid]), address(this)))
        );

        address[] memory oapps = new address[](2);
        oapps[0] = address(umaBridge);
        oapps[1] = address(marketBridge);
        this.wireOApps(oapps);

        umaEndpoint = address(umaBridge.endpoint());
        marketEndpoint = address(marketBridge.endpoint());
        // options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);
    }

    function test_UMA_deposit_LEO() public {
        vm.startPrank(umaUser);

        // uint256 quoteFee = umaBridge.quote(bEid, message, options, false).nativeFee;
        uint256 twiceQuoteFee = 1 ether;

        // MessagingReceipt memory receipt = umaBridge.send{value: twiceQuoteFee}(bEid, message, options, twiceQuoteFee);
        // verifyPackets(bEid, addressToBytes32(address(marketBridge)));

        // assertEq(receipt.fee.nativeFee, quoteFee);
        // assertEq(receipt.fee.lzTokenFee, 0);

        // assertEq(address(endpoint).balance, 0);
        // assertEq((endpointSetup.sendLibs[0]).balance, quoteFee);
    }

    function test_bridge_LEO() public {
        assertEq(address(umaUser).balance, 1000 ether);
        assertEq(address(marketUser).balance, 1000 ether);

        vm.startPrank(umaUser);
        vm.deal(umaUser, 100 ether);
        vm.stopPrank();
        assertEq(
            address(umaUser).balance,
            100 ether
        );
    }

}
