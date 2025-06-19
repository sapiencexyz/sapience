// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";


import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";

contract BridgeTest is TestHelperOz5 {
    using Cannon for Vm;

    address private userA = address(0x1);
    address private userB = address(0x2);

    function setUp() public override {
        vm.deal(userA, 1000 ether);
        vm.deal(userB, 1000 ether);

        super.setUp();
    }

    function test_bridge_LEO() public {
        assertEq(address(userA).balance, 1000 ether);
        assertEq(address(userB).balance, 1000 ether);

        vm.startPrank(userA);
        vm.deal(userA, 100 ether);
        vm.stopPrank();
        assertEq(
            address(userA).balance,
            100 ether
        );
    }

}
