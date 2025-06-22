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

    // Bridges
    MarketLayerZeroBridge private marketBridge;
    UMALayerZeroBridge private umaBridge;

    // Other contracts
    IMintableToken private bondCurrency;
    address private optimisticOracleV3;

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
        oapps[0] = address(marketBridge);
        oapps[1] = address(umaBridge);
        this.wireOApps(oapps);

        umaEndpoint = address(umaBridge.endpoint());
        marketEndpoint = address(marketBridge.endpoint());
        // options = OptionsBuilder.newOptions().addExecutorLzReceiveOption(200000, 0);

        vm.deal(address(umaBridge), 100 ether);
        vm.deal(address(marketBridge), 100 ether);

        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        BridgeTypes.BridgeConfig memory bridgeConfig = BridgeTypes.BridgeConfig({
            remoteChainId: aEid,
            remoteBridge: address(marketBridge),
            settlementModule: address(0)
        });
        umaBridge.setBridgeConfig(bridgeConfig);
        bridgeConfig.remoteChainId = bEid;
        bridgeConfig.remoteBridge = address(umaBridge);
        bridgeConfig.settlementModule = address(0);
        marketBridge.setBridgeConfig(bridgeConfig);

    }

    function test_constructor_LEO() public {
        assertEq(address(marketBridge.owner()), address(this));
        assertEq(address(umaBridge.owner()), address(this));

        assertEq(address(marketBridge.endpoint()), address(endpoints[aEid]));
        assertEq(address(umaBridge.endpoint()), address(endpoints[bEid]));
    }

    function test_UMA_deposit_LEO() public {
        uint256 initialUmaEthBalance = address(umaBridge).balance;
        uint256 initialUmaBondBalance = bondCurrency.balanceOf(umaUser);

        bondCurrency.mint(100 ether, umaUser);
        uint256 initialUmaUserBondBalance = bondCurrency.balanceOf(umaUser);

        vm.startPrank(umaUser);
        bondCurrency.approve(address(umaBridge), 1 ether);
        umaBridge.depositBond(address(bondCurrency), 1 ether);
        vm.stopPrank();

        uint256 finalUmaEthBalance = address(umaBridge).balance;
        uint256 finalUmaUserBondBalance = bondCurrency.balanceOf(umaUser);
        uint256 finalUmaBondBalance = bondCurrency.balanceOf(address(umaBridge));

        assertEq(finalUmaUserBondBalance, initialUmaUserBondBalance - 1 ether);
        assertEq(finalUmaBondBalance, initialUmaBondBalance + 1 ether);

        console.log("initialUmaEthBalance:        ", initialUmaEthBalance);
        console.log("finalUmaEthBalance:          ", finalUmaEthBalance);
        console.log("initialUmaBondBalance:       ", initialUmaBondBalance);
        console.log("finalUmaBondBalance:         ", finalUmaBondBalance);
        console.log("initialUmaUserBondBalance:   ", initialUmaUserBondBalance);
        console.log("finalUmaUserBondBalance:     ", finalUmaUserBondBalance);



        // MessagingReceipt memory receipt = umaBridge.send{value: twiceQuoteFee}(bEid, message, options, twiceQuoteFee);
        // verifyPackets(bEid, addressToBytes32(address(marketBridge)));

        // assertEq(receipt.fee.nativeFee, quoteFee);
        // assertEq(receipt.fee.lzTokenFee, 0);

        // assertEq(address(endpoint).balance, 0);
        // assertEq((endpointSetup.sendLibs[0]).balance, quoteFee);
    }

    function test_bridge() public {
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
