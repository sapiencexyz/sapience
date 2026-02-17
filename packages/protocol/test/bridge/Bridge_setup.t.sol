// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {TestHelperOz5} from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import {TestETHManagement} from "./mocks/TestETHManagement.sol";
import {BridgeTypes} from "../../src/bridge/BridgeTypes.sol";

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTestSetup is TestHelperOz5 {
    using Cannon for Vm;

    address private owner = address(this);
    TestETHManagement private testContract;

    uint32 private eid = 1;

    function setUp() public override {
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

    function test_constructor() public view {
        assertEq(address(testContract.owner()), owner, "Owner should be set");
        assertEq(address(testContract.endpoint()), address(endpoints[eid]), "Endpoint should be set");
    }

    function test_initialBalance() public view {
        assertEq(address(testContract).balance, 100 ether, "Initial balance should be set");
    }
}
